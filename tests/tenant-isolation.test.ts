import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getOrder } from "@/app/api/v1/orders/[id]/route";
import { GET as listOrdersRoute } from "@/app/api/v1/orders/route";
import { GET as searchCustomers } from "@/app/api/v1/customers/search/route";
import { loadRestaurantContext, systemContext } from "@/server/auth/load-context";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { checkout, getOrderDetail } from "@/server/services/orders";
import { tenantDb } from "@/server/tenant-db";
import { apiRequest, cleanup, ensureTestPlans, makeRecipeProduct, makeRestaurant, noParams, signIn, withParams } from "./helpers";

/**
 * The most important guarantee of a multi-tenant POS: a user of restaurant A
 * can never read or change restaurant B's data — not through the tenant
 * client, not through services, not through the API.
 */
describe("tenant isolation", () => {
  let a: Awaited<ReturnType<typeof makeRestaurant>>;
  let b: Awaited<ReturnType<typeof makeRestaurant>>;
  let customerA: { id: string };
  let customerB: { id: string };
  let orderB: { id: string; orderNumber: string };
  let productB: { id: string };

  beforeAll(async () => {
    await ensureTestPlans();
    a = await makeRestaurant("Alpha Dhaba");
    b = await makeRestaurant("Beta Bistro");

    customerA = await tenantDb(a.restaurant.id).customer.create({
      data: { restaurantId: a.restaurant.id, name: "Asha Rao", phone: "9800000001" },
    });
    customerB = await tenantDb(b.restaurant.id).customer.create({
      data: { restaurantId: b.restaurant.id, name: "Bharat Shah", phone: "9800000002" },
    });

    const ctxB = systemContext(b.restaurant.id);
    const { product } = await makeRecipeProduct(ctxB, { stock: 5, perPortionGrams: 100, price: 20_000 });
    productB = product;
    const order = await checkout(ctxB, {
      type: "TAKEAWAY",
      customerId: customerB.id,
      items: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: "CASH", amount: 21_000 }],
    });
    orderB = order;
  });

  afterAll(cleanup);

  describe("tenant client", () => {
    it("only lists the tenant's own rows", async () => {
      const rows = await tenantDb(a.restaurant.id).customer.findMany();
      expect(rows.map((r) => r.id)).toContain(customerA.id);
      expect(rows.map((r) => r.id)).not.toContain(customerB.id);
    });

    it("can't fetch another tenant's row by id", async () => {
      expect(await tenantDb(a.restaurant.id).customer.findUnique({ where: { id: customerB.id } })).toBeNull();
      expect(await tenantDb(a.restaurant.id).order.findFirst({ where: { id: orderB.id } })).toBeNull();
    });

    it("can't update or delete another tenant's row", async () => {
      await expect(
        tenantDb(a.restaurant.id).customer.update({ where: { id: customerB.id }, data: { name: "Hijacked" } }),
      ).rejects.toThrow();
      const bulk = await tenantDb(a.restaurant.id).customer.updateMany({ where: { id: customerB.id }, data: { name: "Hijacked" } });
      expect(bulk.count).toBe(0);
      const removed = await tenantDb(a.restaurant.id).customer.deleteMany({ where: { id: customerB.id } });
      expect(removed.count).toBe(0);

      const untouched = await prisma.customer.findUniqueOrThrow({ where: { id: customerB.id } });
      expect(untouched.name).toBe("Bharat Shah");
    });

    it("stamps its own restaurantId on creates, even if another one is passed", async () => {
      const row = await tenantDb(a.restaurant.id).customer.create({
        data: { restaurantId: b.restaurant.id, name: "Smuggled", phone: "9800000003" },
      });
      expect(row.restaurantId).toBe(a.restaurant.id);
    });

    it("scopes aggregates and counts", async () => {
      const count = await tenantDb(a.restaurant.id).order.count();
      expect(count).toBe(0);
      const sum = await tenantDb(a.restaurant.id).order.aggregate({ _sum: { total: true } });
      expect(sum._sum.total ?? 0).toBe(0);
    });
  });

  describe("services", () => {
    it("can't load another tenant's order", async () => {
      await expect(getOrderDetail(systemContext(a.restaurant.id), orderB.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("can't sell another tenant's product", async () => {
      await expect(
        checkout(systemContext(a.restaurant.id), {
          type: "TAKEAWAY",
          items: [{ productId: productB.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 21_000 }],
        }),
      ).rejects.toThrow();
      expect(await prisma.order.count({ where: { restaurantId: a.restaurant.id } })).toBe(0);
    });
  });

  describe("sessions", () => {
    it("a session pointed at a restaurant the user doesn't belong to resolves to nothing", async () => {
      const { token } = await createSession({ userId: a.owner.id, scope: "RESTAURANT", restaurantId: b.restaurant.id });
      expect(await loadRestaurantContext(token)).toBeNull();
    });

    it("an owner's context is bound to their own restaurant", async () => {
      const { ctx } = await signIn(a.owner.id, a.restaurant.id);
      expect(ctx.restaurantId).toBe(a.restaurant.id);
      expect(ctx.membership.isOwner).toBe(true);
    });
  });

  describe("API", () => {
    it("returns 404 for another tenant's order id", async () => {
      const { token } = await signIn(a.owner.id, a.restaurant.id);
      const res = await getOrder(apiRequest(`/api/v1/orders/${orderB.id}`, { token }), withParams({ id: orderB.id }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain(orderB.orderNumber);
    });

    it("lists only the caller's orders and customers", async () => {
      const { token } = await signIn(a.owner.id, a.restaurant.id);
      const orders = await (await listOrdersRoute(apiRequest("/api/v1/orders", { token }), noParams)).json();
      expect(orders.data.total).toBe(0);

      const customers = await (await searchCustomers(apiRequest("/api/v1/customers/search?q=Bharat", { token }), noParams)).json();
      expect(customers.data).toEqual([]);
    });

    it("the other tenant can read its own order", async () => {
      const { token } = await signIn(b.owner.id, b.restaurant.id);
      const res = await getOrder(apiRequest(`/api/v1/orders/${orderB.id}`, { token }), withParams({ id: orderB.id }));
      expect(res.status).toBe(200);
      expect((await res.json()).data.orderNumber).toBe(orderB.orderNumber);
    });

    it("rejects requests without a session", async () => {
      const res = await listOrdersRoute(apiRequest("/api/v1/orders"), noParams);
      expect(res.status).toBe(401);
    });
  });
});

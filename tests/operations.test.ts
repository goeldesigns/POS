import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as exportReport } from "@/app/api/v1/reports/[report]/export/route";
import { parseCsv, toCsv } from "@/lib/csv";
import { homeFor } from "@/lib/nav";
import { systemContext } from "@/server/auth/load-context";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { checkout, saveOrder } from "@/server/services/orders";
import { saveStaff, type StaffInput } from "@/server/services/staff";
import { mergeTables } from "@/server/services/tables";
import { tenantDb } from "@/server/tenant-db";
import { addMember, apiRequest, cleanup, ensureTestPlans, makeRecipeProduct, makeRestaurant, signIn, withParams } from "./helpers";

/** Floor operations, HR records and exports — rules found while testing the app end to end. */
describe("floor, team and export rules", () => {
  let restaurantId: string;
  let owner: Awaited<ReturnType<typeof signIn>>;
  let manager: Awaited<ReturnType<typeof signIn>>;
  let kitchen: Awaited<ReturnType<typeof signIn>>;
  let productId: string;

  const tables = async () => tenantDb(restaurantId).diningTable.findMany({ orderBy: { sortOrder: "asc" } });

  beforeAll(async () => {
    await ensureTestPlans();
    const r = await makeRestaurant("Echo Eatery", { tables: 5 });
    restaurantId = r.restaurant.id;
    owner = await signIn(r.owner.id, restaurantId);
    manager = await signIn((await addMember(restaurantId, "Manager", "manager")).user.id, restaurantId);
    kitchen = await signIn((await addMember(restaurantId, "Kitchen Staff", "chef")).user.id, restaurantId);
    productId = (await makeRecipeProduct(systemContext(restaurantId), { stock: 5, perPortionGrams: 100, price: 20_000 })).product.id;
  });

  afterAll(cleanup);

  it("won't merge two tables that both have open orders, and moves nothing when it refuses", async () => {
    const [t1, t2, t3] = await tables();
    const a = await saveOrder(owner.ctx, { type: "DINE_IN", tableId: t2!.id, items: [{ productId, quantity: 1 }] }, "KITCHEN");
    const b = await saveOrder(owner.ctx, { type: "DINE_IN", tableId: t3!.id, items: [{ productId, quantity: 1 }] }, "KITCHEN");

    await expect(mergeTables(owner.ctx, t1!.id, [t2!.id, t3!.id])).rejects.toBeInstanceOf(ConflictError);

    const [orderA, orderB] = await Promise.all([prisma.order.findUniqueOrThrow({ where: { id: a.id } }), prisma.order.findUniqueOrThrow({ where: { id: b.id } })]);
    expect(orderA.tableId).toBe(t2!.id);
    expect(orderB.tableId).toBe(t3!.id);
    expect(await prisma.diningTable.count({ where: { restaurantId, mergedIntoId: { not: null } } })).toBe(0);
  });

  it("merging brings a single open order across to the primary table", async () => {
    const [t1, t2, , , t5] = await tables();
    const order = await prisma.order.findFirstOrThrow({ where: { restaurantId, tableId: t2!.id } });

    await mergeTables(owner.ctx, t1!.id, [t2!.id, t5!.id]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).tableId).toBe(t1!.id);
    const merged = await prisma.diningTable.findMany({ where: { restaurantId, mergedIntoId: t1!.id }, select: { id: true } });
    expect(merged.map((t) => t.id).sort()).toEqual([t2!.id, t5!.id].sort());
  });

  it("managers can't edit the owner's staff record or hand out the Owner title", async () => {
    const ownerStaff = await prisma.staffMember.findFirstOrThrow({ where: { restaurantId, restaurantUser: { userId: owner.ctx.actor.userId! } } });
    const base: StaffInput = {
      name: "Rhea Waiter",
      email: null,
      phone: "9800000001",
      roleTitle: "Waiter",
      employeeCode: "EMP-901",
      status: "ACTIVE",
      joiningDate: new Date("2026-01-10T12:00:00Z"),
      salary: 1_800_000,
      address: null,
      emergencyContact: null,
    };
    const ownerEdit = { ...base, id: ownerStaff.id, name: ownerStaff.name, phone: ownerStaff.phone, employeeCode: ownerStaff.employeeCode, roleTitle: "Manager", salary: 0 };

    await expect(saveStaff(manager.ctx, ownerEdit)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveStaff(manager.ctx, { ...base, roleTitle: "Owner" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await prisma.staffMember.findUniqueOrThrow({ where: { id: ownerStaff.id } })).roleTitle).toBe("Owner");

    // Everyday team records are still theirs to manage; owners can edit their own.
    const waiterId = await saveStaff(manager.ctx, base);
    await saveStaff(manager.ctx, { ...base, id: waiterId, salary: 2_000_000 });
    expect((await prisma.staffMember.findUniqueOrThrow({ where: { id: waiterId } })).salary).toBe(2_000_000);
    await saveStaff(owner.ctx, { ...ownerEdit, roleTitle: "Owner", salary: 0 });
  });

  it("exports order dates on the restaurant's clock, not UTC", async () => {
    const order = await checkout(owner.ctx, { type: "TAKEAWAY", items: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 21_000 }] });
    const res = await exportReport(apiRequest("/api/v1/reports/orders/export?period=today", { token: owner.token }), withParams({ report: "orders" }));
    expect(res.status).toBe(200);

    const [header, ...rows] = parseCsv(await res.text());
    const row = rows.find((r) => r[0] === order.orderNumber);
    expect(row).toBeDefined();
    const expected = format(new TZDate(order.createdAt.getTime(), owner.ctx.restaurant.timezone), "yyyy-MM-dd HH:mm");
    expect(row![header!.indexOf("Date")]).toBe(expected);
  });

  it("CSV cells stay numeric for negative amounts but formulas are neutralised", () => {
    const csv = toCsv([{ key: "v", label: "Value" }], [{ v: "-132.70" }, { v: "=HYPERLINK(1)" }, { v: "-1+1" }, { v: "@SUM(A1)" }]);
    expect(parseCsv(csv).slice(1).map((r) => r[0])).toEqual(["-132.70", "'=HYPERLINK(1)", "'-1+1", "'@SUM(A1)"]);
  });

  it("kitchen-only roles land on the ticket board", () => {
    expect(homeFor(kitchen.ctx)).toBe("/app/orders?view=board");
    expect(homeFor(owner.ctx)).not.toContain("view=board");
  });
});

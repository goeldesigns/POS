import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Page guards call next/navigation's redirect() and read the session through
// next/headers. Swap both for test doubles so the real guard logic runs.
const session = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/server/auth/context", () => ({
  getRestaurantContext: async () => session.ctx,
  getPlatformContext: async () => null,
  getRequestMeta: async () => ({ ip: "127.0.0.1", userAgent: "vitest" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  unstable_rethrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { GET as inventoryList } from "@/app/api/v1/inventory/route";
import { POST as inventoryMove } from "@/app/api/v1/inventory/movements/route";
import { canAny, computeEffectivePermissions } from "@/lib/permissions/can";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions/catalog";
import { navFor } from "@/lib/nav";
import { stockMovementAction } from "@/server/actions/inventory";
import { requirePagePermission } from "@/server/auth/guards";
import { loadRestaurantContext, systemContext } from "@/server/auth/load-context";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { recordMovement } from "@/server/services/inventory";
import { setMemberPermissions } from "@/server/services/members";
import { addMember, apiRequest, cleanup, ensureTestPlans, makeRecipeProduct, makeRestaurant, noParams, signIn } from "./helpers";

describe("effective permissions", () => {
  it("role permissions plus grants minus denials, limited to enabled modules", () => {
    const perms = computeEffectivePermissions({
      isOwner: false,
      rolePermissions: ["pos.view", "pos.create_order", "orders.view", "inventory.view"],
      overrides: [
        { permissionKey: "customers.view", effect: "GRANT" },
        { permissionKey: "orders.view", effect: "DENY" },
      ],
      enabledModules: ["pos", "orders", "customers"],
    });
    expect([...perms].sort()).toEqual(["customers.view", "pos.create_order", "pos.view"]);
  });

  it("owners hold every permission of enabled modules only", () => {
    const perms = computeEffectivePermissions({ isOwner: true, rolePermissions: [], overrides: [], enabledModules: ["pos"] });
    expect(perms.has("pos.void_order")).toBe(true);
    expect(perms.has("settings.edit")).toBe(true); // core module, always on
    expect(perms.has("inventory.view")).toBe(false);
    expect(perms.size).toBeLessThan(ALL_PERMISSION_KEYS.length);
  });
});

describe("a user without inventory permission", () => {
  let restaurant: Awaited<ReturnType<typeof makeRestaurant>>;
  let cashier: { token: string; ctx: Awaited<ReturnType<typeof signIn>>["ctx"] };
  let manager: { token: string; ctx: Awaited<ReturnType<typeof signIn>>["ctx"]; memberId: string };
  let ingredientId: string;

  beforeAll(async () => {
    await ensureTestPlans();
    restaurant = await makeRestaurant("Gamma Grill");
    const { ingredient } = await makeRecipeProduct(systemContext(restaurant.restaurant.id), { stock: 10, perPortionGrams: 100, price: 20_000 });
    ingredientId = ingredient.id;

    const c = await addMember(restaurant.restaurant.id, "Cashier", "cashier");
    cashier = await signIn(c.user.id, restaurant.restaurant.id);
    const m = await addMember(restaurant.restaurant.id, "Manager", "manager");
    manager = { ...(await signIn(m.user.id, restaurant.restaurant.id)), memberId: m.member.id };
  });

  afterAll(cleanup);

  it("doesn't have inventory.view", () => {
    expect(cashier.ctx.permissions.has("inventory.view")).toBe(false);
    expect(manager.ctx.permissions.has("inventory.view")).toBe(true);
  });

  it("doesn't see Inventory in the navigation", () => {
    const labels = navFor(cashier.ctx).map((i) => i.label);
    expect(labels).not.toContain("Inventory");
    expect(labels).toContain("POS");
    expect(navFor(manager.ctx).map((i) => i.label)).toContain("Inventory");
  });

  it("is redirected away from the Inventory page before any data loads", async () => {
    session.ctx = cashier.ctx;
    await expect(requirePagePermission("inventory.view")).rejects.toThrow("REDIRECT /app/no-access?required=inventory.view");
    session.ctx = manager.ctx;
    await expect(requirePagePermission("inventory.view")).resolves.toMatchObject({ restaurantId: restaurant.restaurant.id });
  });

  it("is rejected by the inventory API with 403", async () => {
    const res = await inventoryList(apiRequest("/api/v1/inventory", { token: cashier.token }), noParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
    expect(body).not.toHaveProperty("data");

    const ok = await inventoryList(apiRequest("/api/v1/inventory", { token: manager.token }), noParams);
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.rows.map((r: { id: string }) => r.id)).toContain(ingredientId);
  });

  it("can't move stock through the API, the server action or the service", async () => {
    const before = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });

    const res = await inventoryMove(
      apiRequest("/api/v1/inventory/movements", { token: cashier.token, method: "POST", body: { ingredientId, type: "ADD", quantity: 5 } }),
      noParams,
    );
    expect(res.status).toBe(403);

    session.ctx = cashier.ctx;
    const result = await stockMovementAction({ ingredientId, type: "ADD", quantity: 5, reason: null, counterparty: null });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });

    await expect(recordMovement(cashier.ctx, { ingredientId, type: "ADD", quantity: 5, reason: null, counterparty: null })).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    expect(after.currentStock).toBe(before.currentStock);
  });

  it("cross-site cookie writes are blocked even with permission", async () => {
    const res = await inventoryMove(
      apiRequest("/api/v1/inventory/movements", {
        token: manager.token,
        method: "POST",
        body: { ingredientId, type: "ADD", quantity: 1 },
        headers: { origin: "https://evil.example" },
      }),
      noParams,
    );
    expect(res.status).toBe(403);
  });

  it("gains access when a per-user grant is added, and loses it when removed", async () => {
    const cashierMember = await prisma.restaurantUser.findFirstOrThrow({
      where: { restaurantId: restaurant.restaurant.id, userId: cashier.ctx.user.id },
      include: { role: { include: { permissions: true } } },
    });
    const rolePerms = cashierMember.role.permissions.map((p) => p.permissionKey);
    const owner = systemContext(restaurant.restaurant.id);

    await setMemberPermissions(owner, cashierMember.id, [...rolePerms, "inventory.view"]);
    const granted = await loadRestaurantContext(cashier.token);
    expect(granted?.permissions.has("inventory.view")).toBe(true);
    const res = await inventoryList(apiRequest("/api/v1/inventory", { token: cashier.token }), noParams);
    expect(res.status).toBe(200);

    await setMemberPermissions(owner, cashierMember.id, rolePerms);
    const revoked = await loadRestaurantContext(cashier.token);
    expect(revoked?.permissions.has("inventory.view")).toBe(false);
  });

  it("a manager can't grant a permission they don't hold", async () => {
    const cashierMember = await prisma.restaurantUser.findFirstOrThrow({
      where: { restaurantId: restaurant.restaurant.id, userId: cashier.ctx.user.id },
    });
    const managerCtx = { ...manager.ctx, permissions: new Set([...manager.ctx.permissions].filter((p) => p !== "settings.edit")) };
    const escalate = [...managerCtx.permissions, "settings.edit"];
    await expect(setMemberPermissions(managerCtx as never, cashierMember.id, escalate)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("switching the module off removes it even for the owner", async () => {
    const { token } = await signIn(restaurant.owner.id, restaurant.restaurant.id);
    await prisma.restaurantModule.update({
      where: { restaurantId_moduleKey: { restaurantId: restaurant.restaurant.id, moduleKey: "inventory" } },
      data: { enabled: false },
    });
    const owner = await loadRestaurantContext(token);
    expect(owner?.permissions.has("inventory.view")).toBe(false);
    expect(canAny(owner!, ["inventory.view", "inventory.edit"])).toBe(false);
    const res = await inventoryList(apiRequest("/api/v1/inventory", { token }), noParams);
    expect(res.status).toBe(403);

    await prisma.restaurantModule.update({
      where: { restaurantId_moduleKey: { restaurantId: restaurant.restaurant.id, moduleKey: "inventory" } },
      data: { enabled: true },
    });
  });

  it("a suspended restaurant has no permissions at all", async () => {
    await prisma.restaurant.update({ where: { id: restaurant.restaurant.id }, data: { status: "SUSPENDED" } });
    const ctx = await loadRestaurantContext(manager.token);
    expect(ctx?.permissions.size).toBe(0);
    const res = await inventoryList(apiRequest("/api/v1/inventory", { token: manager.token }), noParams);
    expect(res.status).toBe(403);
    await prisma.restaurant.update({ where: { id: restaurant.restaurant.id }, data: { status: "ACTIVE" } });
  });
});

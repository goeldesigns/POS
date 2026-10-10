import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Server actions resolve the admin from a cookie; hand them a real platform
// context instead. Everything after that (validation, services, audit) is real.
const auth = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/server/auth/context", () => ({
  getRestaurantContext: async () => null,
  getPlatformContext: async () => auth.admin,
  getRequestMeta: async () => ({ ip: "127.0.0.1", userAgent: "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  unstable_rethrow: () => {},
}));

import { MODULE_KEYS } from "@/lib/permissions/catalog";
import { SYSTEM_ROLES } from "@/lib/permissions/defaults";
import { navFor } from "@/lib/nav";
import {
  activateRestaurantAction,
  archiveRestaurantAction,
  changeSubscriptionAction,
  createRestaurantAction,
  createRestaurantUserAction,
  setRestaurantModulesAction,
  suspendRestaurantAction,
} from "@/server/actions/platform";
import { verifyPassword } from "@/server/auth/password";
import { loadRestaurantContext } from "@/server/auth/load-context";
import { prisma } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { RUN, PASSWORD, cleanup, ensureTestPlans, makePlatformAdmin, makeRestaurant, signIn, trackRestaurant, trackUser } from "./helpers";

describe("restaurant creation", () => {
  beforeAll(ensureTestPlans);
  afterAll(cleanup);

  it("creates a complete, ready-to-use tenant in one step", async () => {
    const { restaurant, owner } = await makeRestaurant("Epsilon Eatery", { tables: 6 });
    const id = restaurant.id;

    const [settings, taxes, roles, members, staff, modules, subscription, categories, tables, loyalty, integrations] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { restaurantId: id } }),
      prisma.taxRate.findMany({ where: { restaurantId: id } }),
      prisma.role.findMany({ where: { restaurantId: id }, include: { permissions: true } }),
      prisma.restaurantUser.findMany({ where: { restaurantId: id }, include: { role: true } }),
      prisma.staffMember.findMany({ where: { restaurantId: id } }),
      prisma.restaurantModule.findMany({ where: { restaurantId: id } }),
      prisma.subscription.findUnique({ where: { restaurantId: id }, include: { plan: true } }),
      prisma.category.count({ where: { restaurantId: id } }),
      prisma.diningTable.count({ where: { restaurantId: id } }),
      prisma.loyaltyProgram.findUnique({ where: { restaurantId: id } }),
      prisma.integration.findMany({ where: { restaurantId: id } }),
    ]);

    expect(restaurant.slug).toMatch(/^epsilon-eatery-/);
    expect(restaurant.status).toBe("ACTIVE");
    expect(settings).not.toBeNull();
    expect(taxes.find((t) => t.isDefault)?.rate).toBe(5);
    expect(roles.map((r) => r.name).sort()).toEqual(SYSTEM_ROLES.map((r) => r.name).sort());
    expect(roles.find((r) => r.isOwner)?.name).toBe("Owner");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: owner.id, status: "ACTIVE" });
    expect(members[0]!.role.isOwner).toBe(true);
    expect(staff[0]?.employeeCode).toBe("EMP-001");
    expect(modules).toHaveLength(MODULE_KEYS.length);
    expect(modules.every((m) => m.enabled)).toBe(true);
    expect(subscription).toMatchObject({ status: "TRIALING", plan: { key: "test-full" } });
    expect(subscription!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(categories).toBeGreaterThan(0);
    expect(tables).toBe(6);
    expect(loyalty?.isEnabled).toBe(true);
    expect(integrations.map((i) => i.provider).sort()).toEqual(["SWIGGY", "ZOMATO"]);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("gives the owner every permission of the plan's modules and nothing else", async () => {
    const { restaurant, owner } = await makeRestaurant("Zeta Cafe", { planKey: "test-basic" });
    const { ctx } = await signIn(owner.id, restaurant.id);
    expect(ctx.permissions.has("pos.process_payment")).toBe(true);
    expect(ctx.permissions.has("settings.edit")).toBe(true);
    expect(ctx.permissions.has("inventory.view")).toBe(false);
    expect(navFor(ctx).map((i) => i.label)).not.toContain("Inventory");

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { restaurantId: restaurant.id } });
    expect(sub.status).toBe("ACTIVE"); // no trial on this plan
  });

  it("keeps slugs unique and always switches core modules on", async () => {
    const first = await makeRestaurant("Same Name");
    const second = await makeRestaurant("Same Name", { modules: ["pos"] });
    expect(second.restaurant.slug).not.toBe(first.restaurant.slug);

    const enabled = await prisma.restaurantModule.findMany({ where: { restaurantId: second.restaurant.id, enabled: true } });
    expect(enabled.map((m) => m.moduleKey).sort()).toEqual(["overview", "pos", "settings"]);
  });

  it("refuses a login email that already exists, without leaving a half-created restaurant", async () => {
    const existing = await makeRestaurant("Eta Express");
    const name = `Duplicate Owner ${RUN}`;
    const { createRestaurantTenant } = await import("@/server/services/onboarding");
    await expect(
      createRestaurantTenant({
        profile: { name, ownerName: "Someone", email: "x@test.local", phone: "+91 90000 00001" },
        owner: { name: "Someone", email: existing.owner.email.toUpperCase(), password: PASSWORD },
        planKey: "test-full",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.restaurant.count({ where: { name } })).toBe(0);
  });
});

describe("Super Admin restaurant actions", () => {
  let restaurantId: string;
  let ownerToken: string;

  const validInput = (label: string) => ({
    name: `${label} ${RUN}`,
    legalName: "",
    ownerName: "Kavya Menon",
    email: `contact.${label.toLowerCase().replace(/\W/g, "")}.${RUN}@test.local`,
    phone: "+91 98450 11111",
    addressLine: "",
    city: "Kochi",
    state: "Kerala",
    country: "India",
    postalCode: "",
    gstNumber: "32ABCDE1234F1Z5",
    fssaiNumber: "",
    currency: "INR" as const,
    timezone: "Asia/Kolkata" as const,
    restaurantType: "Cafe" as const,
    numberOfTables: "5",
    taxRate: "5",
    taxInclusive: false,
    serviceChargePercent: "0",
    defaultOrderType: "DINE_IN" as const,
    receiptHeader: "",
    receiptFooter: "",
    planKey: "test-full",
    modules: [],
    loginEmail: `kavya.${label.toLowerCase().replace(/\W/g, "")}.${RUN}@test.local`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  beforeAll(async () => {
    await ensureTestPlans();
    const admin = await makePlatformAdmin();
    auth.admin = {
      kind: "platform",
      sessionId: "test",
      user: { id: admin.id, name: admin.name, email: admin.email, avatarUrl: null, platformRole: "SUPER_ADMIN" },
      actor: { userId: admin.id, name: admin.name, role: "Super Admin" },
    };
  });

  afterAll(cleanup);

  it("rejects callers without a platform session", async () => {
    const saved = auth.admin;
    auth.admin = null;
    const result = await createRestaurantAction(validInput("Nobody"));
    auth.admin = saved;
    expect(result).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("validates input on the server", async () => {
    const result = await createRestaurantAction({ ...validInput("Bad Gst"), gstNumber: "12345", confirmPassword: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation_error");
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["gstNumber", "confirmPassword"]));
  });

  it("creates a restaurant and records it in the platform audit log", async () => {
    const result = await createRestaurantAction(validInput("Theta Tiffins"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    restaurantId = result.data.id;
    trackRestaurant(restaurantId);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: validInput("Theta Tiffins").loginEmail } });
    trackUser(owner.id);
    ownerToken = (await signIn(owner.id, restaurantId)).token;

    const entry = await prisma.auditLog.findFirst({ where: { scope: "PLATFORM", action: "restaurant.created", restaurantId } });
    expect(entry?.actorRole).toBe("Super Admin");
  });

  it("module switches apply to the owner's next request", async () => {
    const all = MODULE_KEYS.filter((m) => m !== "inventory");
    expect(await setRestaurantModulesAction({ restaurantId, modules: all })).toMatchObject({ ok: true, data: { disabled: 1 } });
    expect((await loadRestaurantContext(ownerToken))?.permissions.has("inventory.view")).toBe(false);

    await setRestaurantModulesAction({ restaurantId, modules: [...MODULE_KEYS] });
    expect((await loadRestaurantContext(ownerToken))?.permissions.has("inventory.view")).toBe(true);
  });

  it("suspending blocks the restaurant's users; re-activating restores them", async () => {
    expect(await suspendRestaurantAction({ id: restaurantId, reason: "Payment overdue" })).toMatchObject({ ok: true });
    const suspended = await loadRestaurantContext(ownerToken);
    expect(suspended?.restaurant.status).toBe("SUSPENDED");
    expect(suspended?.permissions.size).toBe(0);

    expect(await suspendRestaurantAction({ id: restaurantId, reason: "Again" })).toMatchObject({ ok: false, code: "business_rule" });

    expect(await activateRestaurantAction({ id: restaurantId })).toMatchObject({ ok: true });
    expect((await loadRestaurantContext(ownerToken))?.permissions.has("pos.create_order")).toBe(true);
  });

  it("downgrading with 'reset modules' applies the plan's modules and warns about seats", async () => {
    for (const label of ["one", "two", "three"]) {
      const r = await createRestaurantUserAction({
        restaurantId,
        name: `Waiter ${label}`,
        email: `waiter.${label}.${RUN}@test.local`,
        phone: "",
        password: PASSWORD,
        roleId: (await prisma.role.findFirstOrThrow({ where: { restaurantId, name: "Waiter" } })).id,
        status: "ACTIVE",
      });
      expect(r.ok).toBe(true);
      const u = await prisma.user.findUniqueOrThrow({ where: { email: `waiter.${label}.${RUN}@test.local` } });
      trackUser(u.id);
    }

    const result = await changeSubscriptionAction({
      restaurantId,
      planKey: "test-basic",
      status: "ACTIVE",
      billingInterval: "YEARLY",
      periodEnd: "2027-10-08",
      applyPlanModules: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings[0]).toMatch(/4 users/);

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { restaurantId }, include: { plan: true } });
    expect(sub).toMatchObject({ status: "ACTIVE", billingInterval: "YEARLY", trialEndsAt: null, plan: { key: "test-basic" } });
    const enabled = await prisma.restaurantModule.findMany({ where: { restaurantId, enabled: true } });
    expect(enabled.map((m) => m.moduleKey)).not.toContain("inventory");

    // The plan allows 3 users; adding a fifth is blocked.
    const blocked = await createRestaurantUserAction({
      restaurantId,
      name: "One Too Many",
      email: `extra.${RUN}@test.local`,
      phone: "",
      password: PASSWORD,
      roleId: (await prisma.role.findFirstOrThrow({ where: { restaurantId, name: "Cashier" } })).id,
      status: "ACTIVE",
    });
    expect(blocked).toMatchObject({ ok: false, code: "plan_limit" });

    const entry = await prisma.auditLog.findFirst({ where: { action: "subscription.changed", restaurantId } });
    expect(entry?.summary).toContain("Test Full → Test Basic");
  });

  it("archiving needs the exact name, signs everyone out, and can be undone", async () => {
    const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    expect(await archiveRestaurantAction({ id: restaurantId, confirmName: "wrong name" })).toMatchObject({ ok: false, code: "business_rule" });

    expect(await archiveRestaurantAction({ id: restaurantId, confirmName: r.name })).toMatchObject({ ok: true });
    expect(await prisma.session.count({ where: { restaurantId } })).toBe(0);
    expect(await loadRestaurantContext(ownerToken)).toBeNull();
    const archived = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.deletedAt).not.toBeNull();

    // Changes are refused while archived.
    expect(await setRestaurantModulesAction({ restaurantId, modules: [] })).toMatchObject({ ok: false, code: "business_rule" });

    expect(await activateRestaurantAction({ id: restaurantId })).toMatchObject({ ok: true });
    const restored = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    expect(restored).toMatchObject({ status: "ACTIVE", deletedAt: null });
  });
});

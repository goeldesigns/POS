import { randomUUID } from "node:crypto";
import { CORE_MODULES, MODULE_KEYS, PLAN_FLAGS } from "@/lib/permissions/catalog";
import { loadRestaurantContext, systemContext, type RestaurantContext, type ServiceContext } from "@/server/auth/load-context";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { createMember } from "@/server/services/members";
import { createRestaurantTenant } from "@/server/services/onboarding";

/** Unique per test run so repeated runs never collide in the shared test database. */
export const RUN = randomUUID().slice(0, 8);
export const PASSWORD = "Test@12345";

const created = { restaurants: new Set<string>(), users: new Set<string>() };

export function trackUser(id: string) {
  created.users.add(id);
}

export function trackRestaurant(id: string) {
  created.restaurants.add(id);
}

/** Two plans the tests rely on: everything, and a small one without inventory. */
export async function ensureTestPlans() {
  const plans = [
    { key: "test-full", name: "Test Full", features: [...MODULE_KEYS, ...Object.keys(PLAN_FLAGS)], maxUsers: null, trialDays: 14, sortOrder: 90 },
    {
      key: "test-basic",
      name: "Test Basic",
      features: [...CORE_MODULES, "pos", "orders", "tables", "menu", "customers", "reports"],
      maxUsers: 3,
      trialDays: 0,
      sortOrder: 91,
    },
  ];
  for (const p of plans) {
    const plan = await prisma.plan.upsert({
      where: { key: p.key },
      create: { key: p.key, name: p.name, priceMonthly: 99_900, priceYearly: 999_000, trialDays: p.trialDays, maxUsers: p.maxUsers, sortOrder: p.sortOrder },
      update: { trialDays: p.trialDays, maxUsers: p.maxUsers, isActive: true },
    });
    await prisma.subscriptionFeature.deleteMany({ where: { planId: plan.id } });
    await prisma.subscriptionFeature.createMany({ data: [...new Set(p.features)].map((featureKey) => ({ planId: plan.id, featureKey })) });
  }
}

export async function makeRestaurant(label: string, opts: { planKey?: string; modules?: string[]; tables?: number } = {}) {
  const slug = `${label}-${RUN}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const email = `owner.${slug}.${randomUUID().slice(0, 4)}@test.local`;
  const result = await createRestaurantTenant({
    profile: { name: `${label} ${RUN}`, ownerName: `Owner ${label}`, email, phone: "+91 90000 00000" },
    config: { numberOfTables: opts.tables ?? 4, taxRate: 5 },
    owner: { name: `Owner ${label}`, email, password: PASSWORD },
    planKey: opts.planKey ?? "test-full",
    modules: opts.modules,
  });
  created.restaurants.add(result.restaurant.id);
  created.users.add(result.owner.id);
  return result;
}

/** Add a person with one of the restaurant's system roles. */
export async function addMember(restaurantId: string, roleName: string, label: string) {
  const role = await prisma.role.findFirstOrThrow({ where: { restaurantId, name: roleName } });
  const email = `${label}.${RUN}.${randomUUID().slice(0, 4)}@test.local`.toLowerCase();
  const { user, member } = await createMember(systemContext(restaurantId), {
    name: `${roleName} ${label}`,
    email,
    password: PASSWORD,
    roleId: role.id,
  });
  created.users.add(user.id);
  return { user, member, email };
}

/** A real session token, resolved exactly the way pages and API routes do it. */
export async function signIn(userId: string, restaurantId: string) {
  const { token } = await createSession({ userId, scope: "RESTAURANT", restaurantId, meta: { ip: "127.0.0.1", userAgent: "vitest" } });
  const ctx = await loadRestaurantContext(token);
  if (!ctx) throw new Error("Could not load restaurant context for test user");
  return { token, ctx: ctx as RestaurantContext };
}

export async function makePlatformAdmin() {
  const user = await prisma.user.create({
    data: { email: `admin.${RUN}.${randomUUID().slice(0, 4)}@test.local`, name: "Test Admin", passwordHash: "x", platformRole: "SUPER_ADMIN" },
  });
  created.users.add(user.id);
  return user;
}

export function apiRequest(path: string, opts: { token?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", ...opts.headers };
  if (opts.token) headers.cookie = `tabla_session=${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.method && opts.method !== "GET") headers.origin ??= "http://localhost:3000";
  return new Request(`http://localhost:3000${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export const noParams = { params: Promise.resolve({}) };
export const withParams = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });

/** Ingredient → product → recipe, ready for stock deduction tests. */
export async function makeRecipeProduct(ctx: ServiceContext, opts: { stock: number; perPortionGrams: number; price: number }) {
  const category = await ctx.db.category.findFirstOrThrow();
  const ingredient = await ctx.db.ingredient.create({
    data: { restaurantId: ctx.restaurantId, name: "Paneer", sku: `ING-${randomUUID().slice(0, 6)}`, category: "Dairy", unit: "KG", currentStock: opts.stock, minStock: 1, costPerUnit: 32_000 },
  });
  const product = await ctx.db.product.create({
    data: { restaurantId: ctx.restaurantId, categoryId: category.id, name: "Paneer Tikka", sku: `PRD-${randomUUID().slice(0, 6)}`, price: opts.price },
  });
  await ctx.db.recipe.create({
    data: {
      restaurantId: ctx.restaurantId,
      productId: product.id,
      ingredients: { create: [{ restaurantId: ctx.restaurantId, ingredientId: ingredient.id, quantity: opts.perPortionGrams, unit: "G" }] },
    },
  });
  return { ingredient, product };
}

/**
 * Remove everything this test file created. Children with RESTRICT foreign
 * keys go first so the cascade from Restaurant can't trip over them.
 */
export async function cleanup() {
  const ids = [...created.restaurants];
  if (ids.length) {
    const where = { restaurantId: { in: ids } };
    await prisma.restaurantUser.deleteMany({ where });
    await prisma.comboItem.deleteMany({ where });
    await prisma.recipeIngredient.deleteMany({ where });
    await prisma.purchaseItem.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.diningTable.deleteMany({ where });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
  }
  const users = [...created.users];
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
  created.restaurants.clear();
  created.users.clear();
}

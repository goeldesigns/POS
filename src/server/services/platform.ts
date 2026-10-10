import { Prisma } from "@/generated/prisma/client";
import type { BillingInterval, SubscriptionStatus } from "@/generated/prisma/enums";
import { computeEffectivePermissions } from "@/lib/permissions/can";
import { CORE_MODULES, MODULE_KEYS, PLAN_FLAGS, isModuleKey, type ModuleKey } from "@/lib/permissions/catalog";
import { PLATFORM_TZ } from "@/lib/admin";
import { prisma } from "../db";
import { tenantDb } from "../tenant-db";
import type { PlatformContext, ServiceContext } from "../auth/load-context";
import { NotFoundError } from "../errors";
import { param, parseListParams, type SearchParams } from "../list-params";
import { bucketKeys, bucketLabel, bucketOf, parsePreset, resolvePeriod, type PeriodPreset, type PeriodRange } from "../time";

/**
 * Read models for the Super Admin console. These run with the global client on
 * purpose (platform scope); anything that changes tenant data goes through
 * the tenant services with `adminServiceContext`.
 */

export { PLATFORM_TZ };
export const ADMIN_PERIODS: PeriodPreset[] = ["today", "7d", "30d", "90d", "12m", "custom"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

/** Tenant service context for a platform admin acting on one restaurant. */
export function adminServiceContext(ctx: Pick<PlatformContext, "actor" | "meta">, restaurantId: string): ServiceContext {
  return {
    restaurantId,
    db: tenantDb(restaurantId),
    actor: { userId: ctx.actor.userId, name: ctx.actor.name, role: "Super Admin" },
    permissions: "all",
    meta: ctx.meta,
  };
}

export function platformRange(sp: SearchParams, fallback: PeriodPreset = "30d"): PeriodRange {
  const preset = parsePreset(param(sp, "period"), ADMIN_PERIODS, fallback);
  let from = param(sp, "from");
  let to = param(sp, "to");
  from = from && DATE_RE.test(from) ? from : undefined;
  to = to && DATE_RE.test(to) ? to : undefined;
  if (from && to && from > to) [from, to] = [to, from];
  return resolvePeriod(preset, PLATFORM_TZ, { from: from ?? null, to: to ?? null });
}

function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

type SubPricing = {
  billingInterval: BillingInterval;
  priceOverride: number | null;
  plan: { priceMonthly: number; priceYearly: number };
};

/** Monthly recurring value of a subscription in minor units. */
export function monthlyRecurring(sub: SubPricing): number {
  const price = sub.priceOverride ?? (sub.billingInterval === "YEARLY" ? sub.plan.priceYearly : sub.plan.priceMonthly);
  return sub.billingInterval === "YEARLY" ? Math.round(price / 12) : price;
}

const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/** Completed orders per bucket, aggregated in the database. */
async function completedOrderBuckets(start: Date, end: Date, bucket: PeriodRange["bucket"], restaurantId?: string) {
  const fmt = bucket === "hour" ? "FMHH24" : bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const rows = await prisma.$queryRaw<{ key: string; orders: number; gmv: bigint }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TZ}, ${fmt}) AS key,
           COUNT(*)::int AS orders,
           COALESCE(SUM("total"), 0)::bigint AS gmv
    FROM "Order"
    WHERE "status" = 'COMPLETED'
      AND "createdAt" >= ${utc(start)} AND "createdAt" < ${utc(end)}
      ${restaurantId ? Prisma.sql`AND "restaurantId" = ${restaurantId}` : Prisma.empty}
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.key, { orders: Number(r.orders), gmv: Number(r.gmv) }]));
}

async function gmvTrend(range: PeriodRange, restaurantId?: string) {
  const [cur, prev] = await Promise.all([
    completedOrderBuckets(range.start, range.end, range.bucket, restaurantId),
    completedOrderBuckets(range.prevStart, range.prevEnd, range.bucket, restaurantId),
  ]);
  const curKeys = bucketKeys(range, PLATFORM_TZ);
  const prevKeys = bucketKeys({ start: range.prevStart, end: range.prevEnd, bucket: range.bucket }, PLATFORM_TZ);
  return curKeys.map((key, i) => ({
    label: bucketLabel(key, range.bucket),
    current: cur.get(key)?.gmv ?? 0,
    previous: range.bucket === "hour" ? (prev.get(key)?.gmv ?? 0) : (prev.get(prevKeys[i] ?? "")?.gmv ?? 0),
    orders: cur.get(key)?.orders ?? 0,
  }));
}

const liveRestaurant = { deletedAt: null } satisfies Prisma.RestaurantWhereInput;

// ─── Dashboard ──────────────────────────────────────────────────────────────

export async function getPlatformDashboard(range: PeriodRange) {
  const now = new Date();
  const monthStart = resolvePeriod("month", PLATFORM_TZ, { now }).start;
  const inRange = { gte: range.start, lt: range.end };
  const inPrev = { gte: range.prevStart, lt: range.prevEnd };

  const [
    statusGroups,
    totalUsers,
    activeUsers,
    newRestaurants,
    newUsers,
    orders,
    prevOrders,
    gmv,
    prevGmv,
    subs,
    recent,
    activity,
    trend,
    restaurantDates,
    userDates,
    restaurantsBefore,
    usersBefore,
    top,
  ] = await Promise.all([
    prisma.restaurant.groupBy({ by: ["status"], where: liveRestaurant, _count: { _all: true } }),
    prisma.user.count({ where: { platformRole: null } }),
    prisma.user.count({ where: { platformRole: null, status: "ACTIVE", lastLoginAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.restaurant.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { platformRole: null, createdAt: { gte: monthStart } } }),
    prisma.order.count({ where: { createdAt: inRange, status: { not: "DRAFT" } } }),
    prisma.order.count({ where: { createdAt: inPrev, status: { not: "DRAFT" } } }),
    prisma.order.aggregate({ where: { status: "COMPLETED", createdAt: inRange }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { status: "COMPLETED", createdAt: inPrev }, _sum: { total: true } }),
    prisma.subscription.findMany({
      where: { restaurant: liveRestaurant },
      include: {
        plan: { select: { key: true, name: true, priceMonthly: true, priceYearly: true, sortOrder: true } },
        restaurant: { select: { id: true, name: true, status: true } },
      },
    }),
    prisma.restaurant.findMany({
      where: liveRestaurant,
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        city: true,
        ownerName: true,
        status: true,
        createdAt: true,
        subscription: { select: { status: true, plan: { select: { name: true } } } },
      },
    }),
    prisma.auditLog.findMany({
      where: { scope: "PLATFORM" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, summary: true, actorName: true, createdAt: true, restaurant: { select: { id: true, name: true } } },
    }),
    gmvTrend(range),
    prisma.restaurant.findMany({ where: { createdAt: inRange }, select: { createdAt: true } }),
    prisma.user.findMany({ where: { platformRole: null, createdAt: inRange }, select: { createdAt: true } }),
    prisma.restaurant.count({ where: { createdAt: { lt: range.start } } }),
    prisma.user.count({ where: { platformRole: null, createdAt: { lt: range.start } } }),
    prisma.order.groupBy({
      by: ["restaurantId"],
      where: { status: "COMPLETED", createdAt: inRange },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const liveSubs = subs.filter((s) => s.restaurant.status !== "ARCHIVED");
  const mrr = liveSubs.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + monthlyRecurring(s), 0);
  const atRisk = liveSubs.filter((s) => s.status === "PAST_DUE").reduce((sum, s) => sum + monthlyRecurring(s), 0);

  // Cumulative growth across the selected range.
  const keys = bucketKeys(range, PLATFORM_TZ);
  const rCount = new Map<string, number>();
  const uCount = new Map<string, number>();
  for (const r of restaurantDates) rCount.set(bucketOf(r.createdAt, range.bucket, PLATFORM_TZ), (rCount.get(bucketOf(r.createdAt, range.bucket, PLATFORM_TZ)) ?? 0) + 1);
  for (const u of userDates) uCount.set(bucketOf(u.createdAt, range.bucket, PLATFORM_TZ), (uCount.get(bucketOf(u.createdAt, range.bucket, PLATFORM_TZ)) ?? 0) + 1);
  let rRun = restaurantsBefore;
  let uRun = usersBefore;
  const growth = keys.map((key) => {
    rRun += rCount.get(key) ?? 0;
    uRun += uCount.get(key) ?? 0;
    return { label: bucketLabel(key, range.bucket), restaurants: rRun, users: uRun };
  });

  const planMix = new Map<string, { label: string; value: number; sort: number }>();
  for (const s of liveSubs) {
    const entry = planMix.get(s.plan.key) ?? { label: s.plan.name, value: 0, sort: s.plan.sortOrder };
    entry.value += 1;
    planMix.set(s.plan.key, entry);
  }

  const soon = new Date(now.getTime() + 7 * DAY);
  const attention = [
    ...liveSubs
      .filter((s) => s.status === "PAST_DUE")
      .map((s) => ({ id: s.restaurant.id, name: s.restaurant.name, reason: "Payment overdue", tone: "danger" as const })),
    ...liveSubs
      .filter((s) => s.status === "TRIALING" && (s.trialEndsAt ?? s.currentPeriodEnd) <= soon)
      .map((s) => ({ id: s.restaurant.id, name: s.restaurant.name, reason: `Trial ends ${relativeDays(s.trialEndsAt ?? s.currentPeriodEnd, now)}`, tone: "warning" as const })),
    ...liveSubs
      .filter((s) => s.restaurant.status === "SUSPENDED" && s.status !== "PAST_DUE")
      .map((s) => ({ id: s.restaurant.id, name: s.restaurant.name, reason: "Suspended", tone: "danger" as const })),
  ];

  const topNames = await prisma.restaurant.findMany({ where: { id: { in: top.map((t) => t.restaurantId) } }, select: { id: true, name: true, city: true } });
  const nameOf = new Map(topNames.map((r) => [r.id, r]));

  const gmvValue = gmv._sum.total ?? 0;
  const prevGmvValue = prevGmv._sum.total ?? 0;

  return {
    range,
    kpis: {
      restaurants: {
        total: (byStatus.ACTIVE ?? 0) + (byStatus.SUSPENDED ?? 0),
        active: byStatus.ACTIVE ?? 0,
        suspended: byStatus.SUSPENDED ?? 0,
        trialing: liveSubs.filter((s) => s.status === "TRIALING").length,
      },
      users: { total: totalUsers, active30d: activeUsers },
      orders: { value: orders, delta: delta(orders, prevOrders) },
      gmv: { value: gmvValue, delta: delta(gmvValue, prevGmvValue) },
      mrr: { value: mrr, arr: mrr * 12, atRisk },
      newRestaurants,
      newUsers,
    },
    trend,
    growth,
    planMix: [...planMix.values()].sort((a, b) => a.sort - b.sort).map(({ label, value }) => ({ label, value })),
    recent,
    activity,
    attention,
    top: top.map((t) => ({
      id: t.restaurantId,
      name: nameOf.get(t.restaurantId)?.name ?? "Unknown",
      city: nameOf.get(t.restaurantId)?.city ?? null,
      gmv: t._sum.total ?? 0,
      orders: t._count._all,
    })),
  };
}

function relativeDays(date: Date, now: Date): string {
  const days = Math.ceil((date.getTime() - now.getTime()) / DAY);
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// ─── Restaurants ────────────────────────────────────────────────────────────

const RESTAURANT_SORTS = ["name", "createdAt", "lastActiveAt", "users", "orders"] as const;

export async function listRestaurants(sp: SearchParams) {
  const params = parseListParams(sp, { sortable: RESTAURANT_SORTS, defaultSort: "createdAt" });
  const status = param(sp, "status");
  const plan = param(sp, "plan");
  const billing = param(sp, "billing");

  const where: Prisma.RestaurantWhereInput = {
    ...(status === "ARCHIVED"
      ? { status: "ARCHIVED" }
      : status === "ACTIVE" || status === "SUSPENDED"
        ? { status, deletedAt: null }
        : liveRestaurant),
    ...(plan || billing
      ? {
          subscription: {
            ...(plan ? { plan: { key: plan } } : {}),
            ...(billing && ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"].includes(billing) ? { status: billing as SubscriptionStatus } : {}),
          },
        }
      : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { ownerName: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { phone: { contains: params.q } },
            { city: { contains: params.q, mode: "insensitive" } },
            { slug: { contains: params.q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.RestaurantOrderByWithRelationInput =
    params.sort === "users"
      ? { members: { _count: params.dir } }
      : params.sort === "orders"
        ? { orders: { _count: params.dir } }
        : params.sort === "lastActiveAt"
          ? { lastActiveAt: { sort: params.dir, nulls: "last" } }
          : { [params.sort]: params.dir };

  const [total, rows, plans, counts, archived] = await Promise.all([
    prisma.restaurant.count({ where }),
    prisma.restaurant.findMany({
      where,
      orderBy: [orderBy, { id: "asc" }],
      skip: params.skip,
      take: params.pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        ownerName: true,
        email: true,
        phone: true,
        city: true,
        status: true,
        createdAt: true,
        lastActiveAt: true,
        subscription: { select: { status: true, plan: { select: { key: true, name: true } } } },
        _count: { select: { members: true, orders: true } },
      },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, name: true } }),
    prisma.restaurant.groupBy({ by: ["status"], where: liveRestaurant, _count: { _all: true } }),
    prisma.restaurant.count({ where: { status: "ARCHIVED" } }),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>;
  return {
    params,
    total,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerName: r.ownerName,
      email: r.email,
      phone: r.phone,
      city: r.city,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
      plan: r.subscription?.plan.name ?? null,
      planKey: r.subscription?.plan.key ?? null,
      subscriptionStatus: r.subscription?.status ?? null,
      users: r._count.members,
      orders: r._count.orders,
    })),
    plans,
    stats: {
      total: (byStatus.ACTIVE ?? 0) + (byStatus.SUSPENDED ?? 0),
      active: byStatus.ACTIVE ?? 0,
      suspended: byStatus.SUSPENDED ?? 0,
      archived,
    },
  };
}

export type AdminRestaurantRow = Awaited<ReturnType<typeof listRestaurants>>["rows"][number];

export async function getRestaurantAdmin(id: string) {
  const r = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      settings: { select: { serviceChargePercent: true, taxInclusive: true, defaultOrderType: true, orderPrefix: true } },
      subscription: { include: { plan: { include: { features: true } } } },
      modules: true,
      _count: {
        select: {
          members: true,
          customers: true,
          tables: true,
          orders: true,
          products: { where: { deletedAt: null } },
          apiKeys: { where: { revokedAt: null } },
        },
      },
    },
  });
  if (!r) throw new NotFoundError("Restaurant");

  const enabledModules = new Set<ModuleKey>(CORE_MODULES);
  for (const m of r.modules) if (m.enabled && isModuleKey(m.moduleKey)) enabledModules.add(m.moduleKey);
  const planModules = new Set<string>(
    (r.subscription?.plan.features ?? []).filter((f) => f.enabled && isModuleKey(f.featureKey)).map((f) => f.featureKey),
  );
  for (const m of CORE_MODULES) planModules.add(m);

  return {
    restaurant: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      legalName: r.legalName,
      ownerName: r.ownerName,
      email: r.email,
      phone: r.phone,
      addressLine: r.addressLine,
      city: r.city,
      state: r.state,
      country: r.country,
      postalCode: r.postalCode,
      gstNumber: r.gstNumber,
      fssaiNumber: r.fssaiNumber,
      currency: r.currency,
      timezone: r.timezone,
      restaurantType: r.restaurantType,
      status: r.status,
      suspendedAt: r.suspendedAt?.toISOString() ?? null,
      suspendReason: r.suspendReason,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    },
    settings: r.settings,
    subscription: r.subscription
      ? {
          status: r.subscription.status,
          billingInterval: r.subscription.billingInterval,
          currentPeriodStart: r.subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: r.subscription.currentPeriodEnd.toISOString(),
          trialEndsAt: r.subscription.trialEndsAt?.toISOString() ?? null,
          priceOverride: r.subscription.priceOverride,
          monthlyValue: monthlyRecurring(r.subscription),
          plan: {
            id: r.subscription.plan.id,
            key: r.subscription.plan.key,
            name: r.subscription.plan.name,
            priceMonthly: r.subscription.plan.priceMonthly,
            priceYearly: r.subscription.plan.priceYearly,
            maxUsers: r.subscription.plan.maxUsers,
            maxTables: r.subscription.plan.maxTables,
            maxProducts: r.subscription.plan.maxProducts,
            maxLocations: r.subscription.plan.maxLocations,
            flags: r.subscription.plan.features.filter((f) => f.enabled && f.featureKey in PLAN_FLAGS).map((f) => f.featureKey),
          },
        }
      : null,
    enabledModules: MODULE_KEYS.filter((m) => enabledModules.has(m)),
    planModules: MODULE_KEYS.filter((m) => planModules.has(m)),
    counts: {
      users: r._count.members,
      customers: r._count.customers,
      tables: r._count.tables,
      orders: r._count.orders,
      products: r._count.products,
      apiKeys: r._count.apiKeys,
    },
  };
}

export type RestaurantAdmin = Awaited<ReturnType<typeof getRestaurantAdmin>>;

/** 30-day trading summary for one restaurant. */
export async function getRestaurantTrading(id: string) {
  const range = resolvePeriod("30d", PLATFORM_TZ);
  const where = { restaurantId: id, status: "COMPLETED" as const, createdAt: { gte: range.start, lt: range.end } };
  const [agg, prev, lifetime, lastOrder, bySource, trend] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.aggregate({
      where: { restaurantId: id, status: "COMPLETED", createdAt: { gte: range.prevStart, lt: range.prevEnd } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({ where: { restaurantId: id, status: "COMPLETED" }, _sum: { total: true } }),
    prisma.order.findFirst({ where: { restaurantId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.order.groupBy({ by: ["source"], where, _count: { _all: true }, _sum: { total: true } }),
    gmvTrend(range, id),
  ]);
  const gmv = agg._sum.total ?? 0;
  const orders = agg._count._all;
  return {
    gmv,
    gmvDelta: delta(gmv, prev._sum.total ?? 0),
    orders,
    ordersDelta: delta(orders, prev._count._all),
    aov: orders ? Math.round(gmv / orders) : 0,
    lifetimeGmv: lifetime._sum.total ?? 0,
    lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
    bySource: bySource
      .map((s) => ({ source: s.source, orders: s._count._all, gmv: s._sum.total ?? 0 }))
      .sort((a, b) => b.orders - a.orders),
    trend,
  };
}

/** Members of a restaurant with their effective permissions, for admin screens. */
export async function listRestaurantMembers(restaurantId: string, enabledModules: readonly string[]) {
  const [members, roles] = await Promise.all([
    prisma.restaurantUser.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true, status: true, createdAt: true } },
        role: { select: { id: true, name: true, isOwner: true, permissions: { select: { permissionKey: true } } } },
        permissions: { select: { permissionKey: true, effect: true } },
      },
    }),
    prisma.role.findMany({
      where: { restaurantId },
      orderBy: [{ isOwner: "desc" }, { isSystem: "desc" }, { name: "asc" }],
      include: { permissions: { select: { permissionKey: true } }, _count: { select: { members: true } } },
    }),
  ]);
  return {
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      status: m.status,
      userStatus: m.user.status,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      role: { id: m.role.id, name: m.role.name, isOwner: m.role.isOwner },
      overrides: m.permissions,
      effective: [
        ...computeEffectivePermissions({
          isOwner: m.role.isOwner,
          rolePermissions: m.role.permissions.map((p) => p.permissionKey),
          overrides: m.permissions,
          enabledModules,
        }),
      ],
    })),
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isOwner: r.isOwner,
      isSystem: r.isSystem,
      members: r._count.members,
      permissions: r.permissions.map((p) => p.permissionKey),
    })),
  };
}

export type AdminMember = Awaited<ReturnType<typeof listRestaurantMembers>>["members"][number];
export type AdminRole = Awaited<ReturnType<typeof listRestaurantMembers>>["roles"][number];

export async function listRestaurantOptions() {
  return prisma.restaurant.findMany({
    where: liveRestaurant,
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, status: true },
  });
}

export async function listRoleOptions(restaurantId: string) {
  const roles = await prisma.role.findMany({
    where: { restaurantId },
    orderBy: [{ isOwner: "desc" }, { isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isOwner: true, permissions: { select: { permissionKey: true } } },
  });
  return roles.map((r) => ({ id: r.id, name: r.name, isOwner: r.isOwner, permissions: r.permissions.map((p) => p.permissionKey) }));
}

// ─── Users ──────────────────────────────────────────────────────────────────

const USER_SORTS = ["name", "createdAt", "lastLoginAt"] as const;

export async function listPlatformUsers(sp: SearchParams) {
  const params = parseListParams(sp, { sortable: USER_SORTS, defaultSort: "createdAt" });
  const type = param(sp, "type");
  const status = param(sp, "status");
  const restaurantId = param(sp, "restaurant");

  const where: Prisma.UserWhereInput = {
    ...(type === "platform" ? { platformRole: { not: null } } : type === "restaurant" ? { platformRole: null } : {}),
    ...(status === "ACTIVE" || status === "DISABLED" ? { status } : {}),
    ...(restaurantId ? { memberships: { some: { restaurantId } } } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { phone: { contains: params.q } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.UserOrderByWithRelationInput =
    params.sort === "lastLoginAt" ? { lastLoginAt: { sort: params.dir, nulls: "last" } } : { [params.sort]: params.dir };

  const since = new Date(Date.now() - 30 * DAY);
  const [total, rows, all, admins, active, disabled, restaurants] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [orderBy, { id: "asc" }],
      skip: params.skip,
      take: params.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        platformRole: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            restaurant: { select: { id: true, name: true, status: true } },
            role: { select: { name: true, isOwner: true } },
          },
        },
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { platformRole: { not: null } } }),
    prisma.user.count({ where: { status: "ACTIVE", lastLoginAt: { gte: since } } }),
    prisma.user.count({ where: { status: "DISABLED" } }),
    listRestaurantOptions(),
  ]);

  return {
    params,
    total,
    rows: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      platformRole: u.platformRole,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      memberships: u.memberships.map((m) => ({
        id: m.id,
        status: m.status,
        restaurantId: m.restaurant.id,
        restaurantName: m.restaurant.name,
        restaurantStatus: m.restaurant.status,
        role: m.role.name,
        isOwner: m.role.isOwner,
      })),
    })),
    stats: { total: all, admins, active, disabled },
    restaurants,
  };
}

export type PlatformUserRow = Awaited<ReturnType<typeof listPlatformUsers>>["rows"][number];

// ─── Plans ──────────────────────────────────────────────────────────────────

export async function listPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    include: {
      features: true,
      subscriptions: {
        where: { restaurant: liveRestaurant },
        select: { status: true, billingInterval: true, priceOverride: true },
      },
    },
  });
  return plans.map((p) => {
    const active = p.subscriptions.filter((s) => s.status === "ACTIVE");
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      trialDays: p.trialDays,
      maxUsers: p.maxUsers,
      maxTables: p.maxTables,
      maxProducts: p.maxProducts,
      maxLocations: p.maxLocations,
      isActive: p.isActive,
      isPublic: p.isPublic,
      features: p.features.filter((f) => f.enabled).map((f) => f.featureKey),
      subscribers: p.subscriptions.length,
      activeSubscribers: active.length,
      trialing: p.subscriptions.filter((s) => s.status === "TRIALING").length,
      pastDue: p.subscriptions.filter((s) => s.status === "PAST_DUE").length,
      mrr: active.reduce((sum, s) => sum + monthlyRecurring({ ...s, plan: p }), 0),
    };
  });
}

export type AdminPlan = Awaited<ReturnType<typeof listPlans>>[number];

// ─── Analytics ──────────────────────────────────────────────────────────────

export async function getPlatformAnalytics(range: PeriodRange) {
  const inRange = { gte: range.start, lt: range.end };
  const inPrev = { gte: range.prevStart, lt: range.prevEnd };
  const completed = { status: "COMPLETED" as const, createdAt: inRange };

  const [trend, cur, prev, bySource, byType, activeNow, activePrev, liveCount, top, adoption, signups, plans, cancelled] = await Promise.all([
    gmvTrend(range),
    prisma.order.aggregate({ where: completed, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { status: "COMPLETED", createdAt: inPrev }, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["source"], where: completed, _count: { _all: true }, _sum: { total: true } }),
    prisma.order.groupBy({ by: ["type"], where: completed, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["restaurantId"], where: { createdAt: inRange, status: { not: "DRAFT" } } }),
    prisma.order.groupBy({ by: ["restaurantId"], where: { createdAt: inPrev, status: { not: "DRAFT" } } }),
    prisma.restaurant.count({ where: liveRestaurant }),
    prisma.order.groupBy({
      by: ["restaurantId"],
      where: completed,
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 10,
    }),
    prisma.restaurantModule.groupBy({ by: ["moduleKey"], where: { enabled: true, restaurant: liveRestaurant }, _count: { _all: true } }),
    prisma.restaurant.findMany({ where: { createdAt: inRange }, select: { createdAt: true } }),
    listPlans(),
    prisma.order.count({ where: { status: "CANCELLED", createdAt: inRange } }),
  ]);

  const names = await prisma.restaurant.findMany({
    where: { id: { in: top.map((t) => t.restaurantId) } },
    select: { id: true, name: true, city: true, subscription: { select: { plan: { select: { name: true } } } } },
  });
  const byId = new Map(names.map((n) => [n.id, n]));

  const gmv = cur._sum.total ?? 0;
  const orders = cur._count._all;
  const prevGmv = prev._sum.total ?? 0;
  const prevOrders = prev._count._all;

  const keys = bucketKeys(range, PLATFORM_TZ);
  const signupCount = new Map<string, number>();
  for (const s of signups) {
    const k = bucketOf(s.createdAt, range.bucket, PLATFORM_TZ);
    signupCount.set(k, (signupCount.get(k) ?? 0) + 1);
  }
  const adoptionMap = new Map(adoption.map((a) => [a.moduleKey, a._count._all]));

  return {
    range,
    kpis: {
      gmv: { value: gmv, delta: delta(gmv, prevGmv) },
      orders: { value: orders, delta: delta(orders, prevOrders) },
      aov: { value: orders ? Math.round(gmv / orders) : 0, delta: delta(orders ? gmv / orders : 0, prevOrders ? prevGmv / prevOrders : 0) },
      activeRestaurants: { value: activeNow.length, of: liveCount, delta: delta(activeNow.length, activePrev.length) },
      cancelled,
    },
    trend,
    bySource: bySource.map((s) => ({ source: s.source, orders: s._count._all, gmv: s._sum.total ?? 0 })).sort((a, b) => b.gmv - a.gmv),
    byType: byType.map((t) => ({ type: t.type, orders: t._count._all })).sort((a, b) => b.orders - a.orders),
    top: top.map((t) => {
      const r = byId.get(t.restaurantId);
      const value = t._sum.total ?? 0;
      return {
        id: t.restaurantId,
        name: r?.name ?? "Unknown",
        city: r?.city ?? null,
        plan: r?.subscription?.plan.name ?? null,
        gmv: value,
        orders: t._count._all,
        aov: t._count._all ? Math.round(value / t._count._all) : 0,
        share: gmv ? (value / gmv) * 100 : 0,
      };
    }),
    adoption: MODULE_KEYS.filter((m) => !CORE_MODULES.includes(m)).map((m) => ({ module: m, restaurants: adoptionMap.get(m) ?? 0, of: liveCount })),
    signups: keys.map((k) => ({ label: bucketLabel(k, range.bucket), restaurants: signupCount.get(k) ?? 0 })),
    plans,
  };
}

// ─── Audit logs ─────────────────────────────────────────────────────────────

export async function listAuditLogs(sp: SearchParams, opts: { restaurantId?: string } = {}) {
  const params = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 20 });
  const scope = param(sp, "scope");
  const actor = param(sp, "actor");
  const category = param(sp, "category");
  const restaurantId = opts.restaurantId ?? param(sp, "restaurant");
  const from = param(sp, "from");
  const to = param(sp, "to");

  const createdAt: Prisma.DateTimeFilter = {};
  if (from && DATE_RE.test(from)) createdAt.gte = resolvePeriod("custom", PLATFORM_TZ, { from, to: from }).start;
  if (to && DATE_RE.test(to)) createdAt.lt = new Date(resolvePeriod("custom", PLATFORM_TZ, { from: to, to }).start.getTime() + DAY);

  const where: Prisma.AuditLogWhereInput = {
    ...(scope === "PLATFORM" || scope === "RESTAURANT" ? { scope } : {}),
    ...(actor === "admins" ? { actorRole: "Super Admin" } : actor === "system" ? { userId: null } : {}),
    ...(restaurantId ? { restaurantId } : {}),
    ...(category && /^[a-z_]+$/.test(category) ? { action: { startsWith: `${category}.` } } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(params.q
      ? {
          OR: [
            { summary: { contains: params.q, mode: "insensitive" } },
            { actorName: { contains: params.q, mode: "insensitive" } },
            { action: { contains: params.q, mode: "insensitive" } },
            { entityId: params.q },
          ],
        }
      : {}),
  };

  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: params.dir }, { id: "desc" }],
      skip: params.skip,
      take: params.pageSize,
      include: { restaurant: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.groupBy({ by: ["action"], where: opts.restaurantId ? { restaurantId: opts.restaurantId } : {}, _count: { _all: true } }),
  ]);

  const categories = [...new Set(actions.map((a) => a.action.split(".")[0]!))].sort();
  return {
    params,
    total,
    categories,
    rows: rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      summary: r.summary,
      actorName: r.actorName,
      actorRole: r.actorRole,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      restaurant: r.restaurant,
    })),
  };
}

export type AuditRow = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];

// ─── Platform settings ──────────────────────────────────────────────────────

export const PLATFORM_SETTING_DEFAULTS = {
  platformName: "Tabla",
  supportEmail: "support@tabla.dev",
  supportPhone: "",
  defaultPlanKey: "starter",
  allowSelfSignup: true,
  maintenanceBanner: "",
};

export type PlatformSettings = typeof PLATFORM_SETTING_DEFAULTS;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: Object.keys(PLATFORM_SETTING_DEFAULTS) } } });
  const out: Record<string, unknown> = { ...PLATFORM_SETTING_DEFAULTS };
  for (const row of rows) {
    const fallback = PLATFORM_SETTING_DEFAULTS[row.key as keyof PlatformSettings];
    if (typeof row.value === typeof fallback) out[row.key] = row.value;
  }
  return out as PlatformSettings;
}

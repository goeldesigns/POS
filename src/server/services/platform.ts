import type { BillingInterval, SubscriptionStatus } from "@/lib/enums";
import { PLATFORM_TZ } from "@/lib/admin";
import type { ModuleKey } from "@/lib/permissions/catalog";
import { backend, pick } from "../backend/client";
import { param, parseListParams, type SearchParams } from "../list-params";
import { parsePreset, resolvePeriod, type PeriodPreset, type PeriodRange } from "../time";

export { PLATFORM_TZ };
export const ADMIN_PERIODS: PeriodPreset[] = ["today", "7d", "30d", "90d", "12m", "custom"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PlatformRange = PeriodRange & { from?: string; to?: string };

export function platformRange(sp: SearchParams, fallback: PeriodPreset = "30d"): PlatformRange {
  const preset = parsePreset(param(sp, "period"), ADMIN_PERIODS, fallback);
  let from = param(sp, "from");
  let to = param(sp, "to");
  from = from && DATE_RE.test(from) ? from : undefined;
  to = to && DATE_RE.test(to) ? to : undefined;
  if (from && to && from > to) [from, to] = [to, from];
  return { ...resolvePeriod(preset, PLATFORM_TZ, { from: from ?? null, to: to ?? null }), from, to };
}

const rangeQuery = (range: PlatformRange) => ({ period: range.preset, from: range.from, to: range.to });

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

interface DashboardWire {
  kpis: {
    restaurants: { total: number; active: number; suspended: number; trialing: number };
    users: { total: number; active30d: number };
    orders: { value: number; delta: number | null };
    gmv: { value: number; delta: number | null };
    mrr: { value: number; arr: number; atRisk: number };
    newRestaurants: number;
    newUsers: number;
  };
  trend: { label: string; current: number | null; previous: number; orders: number }[];
  growth: { label: string; restaurants: number; users: number }[];
  planMix: { label: string; value: number }[];
  recent: { id: string; name: string; city: string | null; ownerName: string; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED"; createdAt: string; subscriptionStatus: SubscriptionStatus | null; plan: string | null }[];
  activity: { id: string; action: string; summary: string; actorName: string; createdAt: string; restaurant: { id: string; name: string } | null }[];
  attention: { id: string; name: string; reason: string; tone: "danger" | "warning" }[];
  top: { id: string; name: string; city: string | null; gmv: number; orders: number }[];
}

export async function getPlatformDashboard(range: PlatformRange) {
  const d = await backend.get<DashboardWire>("/api/v1/admin/dashboard", rangeQuery(range));
  return {
    range,
    kpis: d.kpis,
    trend: d.trend,
    growth: d.growth,
    planMix: d.planMix,
    recent: d.recent.map(({ subscriptionStatus, plan, createdAt, ...r }) => ({
      ...r,
      createdAt: new Date(createdAt),
      subscription: subscriptionStatus && plan ? { status: subscriptionStatus, plan: { name: plan } } : null,
    })),
    activity: d.activity.map((a) => ({ ...a, createdAt: new Date(a.createdAt) })),
    attention: d.attention,
    top: d.top,
  };
}

interface RestaurantRowWire {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string | null;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  createdAt: string;
  lastActiveAt: string | null;
  plan: string | null;
  planKey: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  users: number;
  orders: number;
}

export async function listRestaurants(sp: SearchParams) {
  const params = parseListParams(sp, { sortable: ["name", "createdAt", "lastActiveAt", "users", "orders"] as const, defaultSort: "createdAt" });
  const data = await backend.get<{ total: number; rows: RestaurantRowWire[]; plans: { key: string; name: string }[]; stats: { total: number; active: number; suspended: number; archived: number } }>(
    "/api/v1/admin/restaurants",
    pick(sp, "q", "status", "plan", "billing", "page", "pageSize", "sort", "dir"),
  );
  return { params, total: data.total, rows: data.rows, plans: data.plans, stats: data.stats };
}

export type AdminRestaurantRow = Awaited<ReturnType<typeof listRestaurants>>["rows"][number];

export interface RestaurantAdmin {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    legalName: string | null;
    ownerName: string;
    email: string;
    phone: string;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    country: string;
    postalCode: string | null;
    gstNumber: string | null;
    fssaiNumber: string | null;
    currency: string;
    timezone: string;
    restaurantType: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    suspendedAt: string | null;
    suspendReason: string | null;
    deletedAt: string | null;
    lastActiveAt: string | null;
    createdAt: string;
  };
  settings: { serviceChargePercent: number; taxInclusive: boolean; defaultOrderType: string; orderPrefix: string } | null;
  subscription: {
    status: SubscriptionStatus;
    billingInterval: BillingInterval;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    priceOverride: number | null;
    monthlyValue: number;
    plan: {
      id: string;
      key: string;
      name: string;
      priceMonthly: number;
      priceYearly: number;
      maxUsers: number | null;
      maxTables: number | null;
      maxProducts: number | null;
      maxLocations: number | null;
      flags: string[];
    };
  } | null;
  enabledModules: string[];
  planModules: string[];
  counts: { users: number; customers: number; tables: number; orders: number; products: number; apiKeys: number };
}

export async function getRestaurantAdmin(id: string) {
  return backend.get<RestaurantAdmin>(`/api/v1/admin/restaurants/${id}`);
}

export async function getRestaurantTrading(id: string) {
  return backend.get<{
    gmv: number;
    gmvDelta: number | null;
    orders: number;
    ordersDelta: number | null;
    aov: number;
    lifetimeGmv: number;
    lastOrderAt: string | null;
    bySource: { source: string; orders: number; gmv: number }[];
    trend: { label: string; current: number | null; previous: number; orders: number }[];
  }>(`/api/v1/admin/restaurants/${id}/trading`);
}

export interface AdminMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "SUSPENDED";
  userStatus: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string; isOwner: boolean };
  overrides: { permissionKey: string; effect: "GRANT" | "DENY" }[];
  effective: string[];
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  isSystem: boolean;
  members: number;
  permissions: string[];
}

export async function listRestaurantMembers(restaurantId: string, _enabledModules: readonly string[]) {
  return backend.get<{ members: AdminMember[]; roles: AdminRole[] }>(`/api/v1/admin/restaurants/${restaurantId}/members`);
}

export async function listRestaurantOptions() {
  return backend.get<{ id: string; name: string; city: string | null; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" }[]>("/api/v1/admin/restaurants/options");
}

export async function listRoleOptions(restaurantId: string) {
  const { roles } = await listRestaurantMembers(restaurantId, []);
  return roles.map((r) => ({ id: r.id, name: r.name, isOwner: r.isOwner, permissions: r.permissions }));
}

interface PlatformUserWire {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "DISABLED";
  platformRole: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  memberships: { id: string; status: "ACTIVE" | "SUSPENDED"; restaurantId: string; restaurantName: string; restaurantStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED"; role: string; isOwner: boolean }[];
}

export async function listPlatformUsers(sp: SearchParams) {
  const params = parseListParams(sp, { sortable: ["name", "createdAt", "lastLoginAt"] as const, defaultSort: "createdAt" });
  const data = await backend.get<{
    total: number;
    rows: PlatformUserWire[];
    stats: { total: number; admins: number; active: number; disabled: number };
    restaurants: { id: string; name: string; city: string | null; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" }[];
  }>("/api/v1/admin/users", pick(sp, "q", "status", "role", "restaurant", "page", "pageSize", "sort", "dir"));
  return { params, total: data.total, rows: data.rows, stats: data.stats, restaurants: data.restaurants };
}

export type PlatformUserRow = Awaited<ReturnType<typeof listPlatformUsers>>["rows"][number];

export interface AdminPlan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  maxUsers: number | null;
  maxTables: number | null;
  maxProducts: number | null;
  maxLocations: number | null;
  isActive: boolean;
  isPublic: boolean;
  features: string[];
  subscribers: number;
  activeSubscribers: number;
  trialing: number;
  pastDue: number;
  mrr: number;
}

export async function listPlans() {
  return backend.get<AdminPlan[]>("/api/v1/admin/plans");
}

interface AnalyticsWire {
  kpis: {
    gmv: { value: number; delta: number | null };
    orders: { value: number; delta: number | null };
    aov: { value: number; delta: number | null };
    activeRestaurants: { value: number; of: number; delta: number | null };
    cancelled: number;
  };
  trend: { label: string; current: number | null; previous: number; orders: number }[];
  bySource: { source: string; orders: number; gmv: number }[];
  byType: { type: string; orders: number }[];
  top: { id: string; name: string; city: string | null; plan: string | null; gmv: number; orders: number; aov: number; share: number }[];
  adoption: { module: ModuleKey; restaurants: number; of: number }[];
  signups: { label: string; restaurants: number }[];
  plans: AdminPlan[];
}

export async function getPlatformAnalytics(range: PlatformRange) {
  const a = await backend.get<AnalyticsWire>("/api/v1/admin/analytics", rangeQuery(range));
  return { range, ...a };
}

interface AuditRowWire {
  id: string;
  scope: "PLATFORM" | "RESTAURANT";
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: string;
  actorName: string;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
  restaurant: { id: string; name: string } | null;
}

export async function listAuditLogs(sp: SearchParams, opts: { restaurantId?: string } = {}) {
  const params = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 20 });
  const data = await backend.get<{ total: number; categories: string[]; rows: AuditRowWire[] }>("/api/v1/admin/audit-logs", {
    ...pick(sp, "q", "scope", "actor", "category", "restaurant", "from", "to", "page", "pageSize", "dir"),
    ...(opts.restaurantId ? { restaurant: opts.restaurantId } : {}),
  });
  return { params, total: data.total, categories: data.categories, rows: data.rows };
}

export type AuditRow = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];

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
  return backend.get<PlatformSettings>("/api/v1/public/platform");
}

export async function listPublicPlans(): Promise<AdminPlan[]> {
  const plans = await backend.get<
    Pick<AdminPlan, "key" | "name" | "description" | "priceMonthly" | "priceYearly" | "trialDays" | "maxUsers" | "maxTables" | "maxProducts" | "maxLocations" | "features">[]
  >("/api/v1/public/plans");
  return plans.map((p) => ({ ...p, id: p.key, isActive: true, isPublic: true, subscribers: 0, activeSubscribers: 0, trialing: 0, pastDue: 0, mrr: 0 }));
}

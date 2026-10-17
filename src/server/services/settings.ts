import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

export async function getSettingsValues(_ctx: ServiceContext, section: string) {
  const all = await backend.get<Record<string, Record<string, unknown>>>("/api/v1/settings");
  return all[section] ?? {};
}

export async function saveSettingsSection(_ctx: ServiceContext, section: string, values: Record<string, unknown>) {
  await backend.put(`/api/v1/settings/${section}`, values);
}

export interface TaxRateWire {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
  products: number;
}

export async function listTaxRates(_ctx: ServiceContext) {
  return backend.get<TaxRateWire[]>("/api/v1/settings/tax-rates");
}

export async function saveTaxRate(_ctx: ServiceContext, input: { id?: string; name: string; rate: number; isDefault: boolean; isActive: boolean }) {
  const { id, ...body } = input;
  if (id) await backend.put(`/api/v1/settings/tax-rates/${id}`, body);
  else await backend.post("/api/v1/settings/tax-rates", body);
}

export async function deleteTaxRate(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/settings/tax-rates/${id}`);
}

export interface CouponWire {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENT" | "FLAT";
  value: number;
  minOrder: number | null;
  maxDiscount: number | null;
  validFrom: string | null;
  validTo: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export async function listCoupons(_ctx: ServiceContext) {
  return backend.get<CouponWire[]>("/api/v1/settings/coupons");
}

export async function saveCoupon(
  _ctx: ServiceContext,
  input: { id?: string; code: string; description: string | null; type: "PERCENT" | "FLAT"; value: number; minOrder: number | null; maxDiscount: number | null; validFrom: Date | null; validTo: Date | null; usageLimit: number | null; isActive: boolean },
) {
  const { id, ...rest } = input;
  const body = {
    ...rest,
    value: rest.type === "FLAT" ? Math.round(rest.value * 100) : rest.value,
    validFrom: input.validFrom ? input.validFrom.toISOString().slice(0, 10) : null,
    validTo: input.validTo ? input.validTo.toISOString().slice(0, 10) : null,
  };
  if (id) await backend.put(`/api/v1/settings/coupons/${id}`, body);
  else await backend.post("/api/v1/settings/coupons", body);
}

export async function deleteCoupon(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/settings/coupons/${id}`);
}

export interface ApiKeyWire {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export async function listApiKeys(_ctx: ServiceContext) {
  return backend.get<{ allowed: boolean; rows: ApiKeyWire[] }>("/api/v1/settings/api-keys");
}

export async function createApiKey(_ctx: ServiceContext, input: { name: string; scopes: string[] }) {
  return backend.post<{ key: string }>("/api/v1/settings/api-keys", input);
}

export async function revokeApiKey(_ctx: ServiceContext, id: string) {
  await backend.post(`/api/v1/settings/api-keys/${id}/revoke`);
}

export async function listSessions(_ctx: ServiceContext) {
  return backend.get<{ id: string; userAgent: string | null; ipAddress: string | null; lastSeenAt: string; current: boolean }[]>("/api/v1/settings/sessions");
}

export async function signOutOtherSessions(_ctx: ServiceContext) {
  return backend.post<{ count: number }>("/api/v1/settings/sessions/sign-out-others");
}

export async function securityLog(_ctx: ServiceContext) {
  return backend.get<{ id: string; summary: string; action: string; createdAt: string; ipAddress: string | null }[]>("/api/v1/settings/security-log");
}

export interface SubscriptionWire {
  plan: string;
  description: string | null;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  billingInterval: "MONTHLY" | "YEARLY";
  price: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  provider: string | null;
  usage: { key: string; label: string; used: number; limit: number | null }[];
}

export async function getSubscription(_ctx: ServiceContext) {
  return backend.get<SubscriptionWire>("/api/v1/settings/subscription");
}

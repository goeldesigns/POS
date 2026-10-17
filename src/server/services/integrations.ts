import type { IntegrationProvider } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

interface IntegrationWire {
  provider: IntegrationProvider;
  displayName: string;
  docsUrl: string;
  status: "DISCONNECTED" | "PENDING" | "CONNECTED" | "ERROR";
  storeId: string | null;
  autoAcceptOrders: boolean;
  autoSyncMenu: boolean;
  syncInventory: boolean;
  syncPricing: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  hasCredentials: boolean;
  keyHint: string | null;
  credentialsUpdatedAt: string | null;
  canManage: boolean;
  counts: Record<string, number>;
}

interface ExternalOrderWire {
  id: string;
  provider: IntegrationProvider;
  externalId: string;
  status: "RECEIVED" | "IMPORTED" | "REJECTED" | "FAILED";
  error: string | null;
  receivedAt: string;
  customer: string;
  items: number;
  order: { id: string; orderNumber: string; total: number; status: string } | null;
}

export async function getIntegrations(_ctx: ServiceContext) {
  return backend.get<{ integrations: IntegrationWire[]; externalOrders: ExternalOrderWire[] }>("/api/v1/integrations");
}

const path = (provider: IntegrationProvider) => provider.toLowerCase();

export async function saveIntegrationSettings(
  _ctx: ServiceContext,
  input: { provider: IntegrationProvider; storeId: string | null; autoAcceptOrders: boolean; autoSyncMenu: boolean; syncInventory: boolean; syncPricing: boolean },
) {
  const { provider, ...body } = input;
  await backend.put(`/api/v1/integrations/${path(provider)}/settings`, body);
}

export async function saveCredentials(_ctx: ServiceContext, input: { provider: IntegrationProvider; apiKey: string; apiSecret: string; webhookSecret: string }) {
  const { provider, ...body } = input;
  return backend.put<{ ok: boolean; status: "CONNECTED" | "PENDING" | "ERROR"; message: string }>(`/api/v1/integrations/${path(provider)}/credentials`, body);
}

export async function testIntegration(_ctx: ServiceContext, provider: IntegrationProvider) {
  return backend.post<{ ok: boolean; status: "CONNECTED" | "PENDING" | "ERROR"; message: string }>(`/api/v1/integrations/${path(provider)}/test`);
}

export async function disconnectIntegration(_ctx: ServiceContext, provider: IntegrationProvider) {
  await backend.delete(`/api/v1/integrations/${path(provider)}`);
}

export async function importExternalOrder(_ctx: ServiceContext, externalOrderId: string) {
  return backend.post<{ status: "IMPORTED" | "FAILED"; orderId: string | null }>(`/api/v1/integrations/external-orders/${externalOrderId}/accept`);
}

export async function rejectExternalOrder(_ctx: ServiceContext, externalOrderId: string, reason: string) {
  await backend.post(`/api/v1/integrations/external-orders/${externalOrderId}/reject`, { reason });
}

export async function sendSandboxOrder(_ctx: ServiceContext, provider: IntegrationProvider) {
  return backend.post<{ externalOrderId: string; status: "RECEIVED" | "IMPORTED" | "REJECTED" | "FAILED"; duplicate: boolean }>(`/api/v1/integrations/${path(provider)}/sandbox`);
}

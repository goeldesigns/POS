import type { IntegrationProvider } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission, hasPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { decryptJson, encryptJson, generateToken } from "../crypto";
import { BusinessRuleError, NotFoundError } from "../errors";
import { ADAPTERS } from "../integrations/adapters";
import type { AggregatorEnvelope, IntegrationCredentials } from "../integrations/types";
import { checkout, saveOrder } from "./orders";

const perm = (p: IntegrationProvider, action: "view" | "manage") => `${p.toLowerCase()}.${action}` as "swiggy.view" | "swiggy.manage" | "zomato.view" | "zomato.manage";

export async function getIntegrations(ctx: ServiceContext) {
  const providers = (["SWIGGY", "ZOMATO"] as const).filter((p) => hasPermission(ctx, perm(p, "view")));
  const rows = await ctx.db.integration.findMany({
    where: { provider: { in: [...providers] } },
    include: { credential: { select: { keyHint: true, updatedAt: true } } },
  });
  const counts = await ctx.db.externalOrder.groupBy({ by: ["provider", "status"], where: { provider: { in: [...providers] } }, _count: true });
  const externalOrders = await ctx.db.externalOrder.findMany({
    where: { provider: { in: [...providers] } },
    orderBy: { receivedAt: "desc" },
    take: 30,
    include: { order: { select: { id: true, orderNumber: true, total: true, status: true } } },
  });
  return {
    integrations: providers.map((p) => {
      const i = rows.find((r) => r.provider === p);
      return {
        provider: p,
        displayName: ADAPTERS[p].displayName,
        docsUrl: ADAPTERS[p].docsUrl,
        status: i?.status ?? "DISCONNECTED",
        storeId: i?.storeId ?? null,
        autoAcceptOrders: i?.autoAcceptOrders ?? false,
        autoSyncMenu: i?.autoSyncMenu ?? false,
        syncInventory: i?.syncInventory ?? false,
        syncPricing: i?.syncPricing ?? false,
        lastSyncAt: i?.lastSyncAt?.toISOString() ?? null,
        lastSyncStatus: i?.lastSyncStatus ?? null,
        lastError: i?.lastError ?? null,
        hasCredentials: !!i?.credential,
        keyHint: i?.credential?.keyHint ?? null,
        credentialsUpdatedAt: i?.credential?.updatedAt.toISOString() ?? null,
        canManage: hasPermission(ctx, perm(p, "manage")),
        counts: Object.fromEntries(counts.filter((c) => c.provider === p).map((c) => [c.status, c._count])) as Record<string, number>,
      };
    }),
    externalOrders: externalOrders.map((e) => ({
      id: e.id,
      provider: e.provider,
      externalId: e.externalId,
      status: e.status,
      error: e.error,
      receivedAt: e.receivedAt.toISOString(),
      customer: (e.payload as { customer?: { name?: string } }).customer?.name ?? "—",
      items: ((e.payload as { items?: unknown[] }).items ?? []).length,
      order: e.order,
    })),
  };
}

async function ensureIntegration(ctx: ServiceContext, provider: IntegrationProvider) {
  return ctx.db.integration.upsert({
    where: { restaurantId_provider: { restaurantId: ctx.restaurantId, provider } },
    create: { restaurantId: ctx.restaurantId, provider },
    update: {},
  });
}

export async function saveIntegrationSettings(
  ctx: ServiceContext,
  input: { provider: IntegrationProvider; storeId: string | null; autoAcceptOrders: boolean; autoSyncMenu: boolean; syncInventory: boolean; syncPricing: boolean },
) {
  assertPermission(ctx, perm(input.provider, "manage"));
  const i = await ensureIntegration(ctx, input.provider);
  await ctx.db.integration.update({
    where: { id: i.id },
    data: { storeId: input.storeId, autoAcceptOrders: input.autoAcceptOrders, autoSyncMenu: input.autoSyncMenu, syncInventory: input.syncInventory, syncPricing: input.syncPricing },
  });
  await audit(ctx, { action: "integration.updated", entity: "Integration", entityId: i.id, summary: `${ctx.actor.name} updated ${ADAPTERS[input.provider].displayName} settings` });
}

export async function saveCredentials(ctx: ServiceContext, input: { provider: IntegrationProvider } & IntegrationCredentials) {
  assertPermission(ctx, perm(input.provider, "manage"));
  const i = await ensureIntegration(ctx, input.provider);
  const creds: IntegrationCredentials = { apiKey: input.apiKey, apiSecret: input.apiSecret, webhookSecret: input.webhookSecret };
  await ctx.db.integrationCredential.upsert({
    where: { integrationId: i.id },
    create: { restaurantId: ctx.restaurantId, integrationId: i.id, encryptedPayload: encryptJson(creds), keyHint: input.apiKey.slice(-4) },
    update: { encryptedPayload: encryptJson(creds), keyHint: input.apiKey.slice(-4) },
  });
  const result = await ADAPTERS[input.provider].testConnection(creds, i.storeId);
  await ctx.db.integration.update({
    where: { id: i.id },
    data: { status: result.status, lastSyncAt: new Date(), lastSyncStatus: result.message, lastError: result.ok ? null : result.status === "ERROR" ? result.message : null, connectedAt: result.ok ? new Date() : null },
  });
  await audit(ctx, { action: "integration.credentials_saved", entity: "Integration", entityId: i.id, summary: `${ctx.actor.name} saved ${ADAPTERS[input.provider].displayName} credentials (key …${input.apiKey.slice(-4)})` });
  return result;
}

export async function testIntegration(ctx: ServiceContext, provider: IntegrationProvider) {
  assertPermission(ctx, perm(provider, "manage"));
  const i = await ctx.db.integration.findFirst({ where: { provider }, include: { credential: true } });
  if (!i?.credential) throw new BusinessRuleError("Save API credentials first");
  const result = await ADAPTERS[provider].testConnection(decryptJson<IntegrationCredentials>(i.credential.encryptedPayload), i.storeId);
  await ctx.db.integration.update({ where: { id: i.id }, data: { status: result.status, lastSyncAt: new Date(), lastSyncStatus: result.message } });
  return result;
}

export async function disconnectIntegration(ctx: ServiceContext, provider: IntegrationProvider) {
  assertPermission(ctx, perm(provider, "manage"));
  const i = await ctx.db.integration.findFirst({ where: { provider } });
  if (!i) throw new NotFoundError("Integration");
  await ctx.db.integrationCredential.deleteMany({ where: { integrationId: i.id } });
  await ctx.db.integration.update({ where: { id: i.id }, data: { status: "DISCONNECTED", autoAcceptOrders: false, autoSyncMenu: false, syncInventory: false, syncPricing: false, connectedAt: null, lastSyncStatus: "Disconnected" } });
  await audit(ctx, { action: "integration.disconnected", entity: "Integration", entityId: i.id, summary: `${ctx.actor.name} disconnected ${ADAPTERS[provider].displayName}` });
}

/** Store an incoming aggregator order (idempotent) and import it if auto-accept is on. */
export async function ingestExternalOrder(ctx: ServiceContext, provider: IntegrationProvider, envelope: AggregatorEnvelope) {
  const integration = await ensureIntegration(ctx, provider);
  const existing = await ctx.db.externalOrder.findFirst({ where: { provider, externalId: envelope.orderId } });
  if (existing) return { externalOrderId: existing.id, status: existing.status, duplicate: true };
  const ext = await ctx.db.externalOrder.create({
    data: { restaurantId: ctx.restaurantId, integrationId: integration.id, provider, externalId: envelope.orderId, payload: envelope as never },
  });
  if (integration.autoAcceptOrders) {
    const r = await importExternalOrder(ctx, ext.id);
    return { externalOrderId: ext.id, status: r.status, duplicate: false };
  }
  return { externalOrderId: ext.id, status: "RECEIVED" as const, duplicate: false };
}

/** Convert a stored aggregator order into a kitchen order via the unified pipeline. */
export async function importExternalOrder(ctx: ServiceContext, externalOrderId: string) {
  const ext = await ctx.db.externalOrder.findUnique({ where: { id: externalOrderId } });
  if (!ext) throw new NotFoundError("External order");
  if (ext.status === "IMPORTED") return { status: "IMPORTED" as const, orderId: ext.orderId };
  const envelope = ext.payload as unknown as AggregatorEnvelope;
  const products = await ctx.db.product.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, sku: true, name: true } });
  const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p.id]));
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p.id]));
  const unmatched: string[] = [];
  const items = envelope.items.flatMap((i) => {
    const id = (i.sku && bySku.get(i.sku.toUpperCase())) || byName.get(i.name.toLowerCase());
    if (!id) {
      unmatched.push(i.sku ? `${i.name} (${i.sku})` : i.name);
      return [];
    }
    return [{ productId: id, quantity: i.quantity, modifierIds: [], notes: i.notes ?? null }];
  });
  if (unmatched.length) {
    await ctx.db.externalOrder.update({ where: { id: ext.id }, data: { status: "FAILED", error: `Unmatched items: ${unmatched.join(", ")}. Map SKUs in your menu.`, processedAt: new Date() } });
    return { status: "FAILED" as const, orderId: null };
  }
  try {
    const draft = {
      source: ext.provider,
      type: envelope.fulfilment === "PICKUP" ? ("TAKEAWAY" as const) : ("ONLINE" as const),
      customer: null,
      deliveryAddress: envelope.deliveryAddress ?? null,
      notes: [envelope.instructions, `${ADAPTERS[ext.provider].displayName} #${envelope.orderId}`].filter(Boolean).join(" · "),
      items,
      externalRef: envelope.orderId,
    };
    // Price with our menu, then settle prepaid orders as paid by the platform.
    const order =
      envelope.payment.mode === "PREPAID"
        ? await (async () => {
            const draftOrder = await saveOrder(ctx, draft, "KITCHEN");
            return checkout(ctx, { ...draft, orderId: draftOrder.id, payments: [{ method: "OTHER", amount: draftOrder.total, reference: `Settled by ${ADAPTERS[ext.provider].displayName}` }] });
          })()
        : await saveOrder(ctx, draft, "KITCHEN");
    await ctx.db.order.update({ where: { id: order.id }, data: { customerName: envelope.customer.name, customerPhone: envelope.customer.phone ?? null } });
    await ctx.db.externalOrder.update({ where: { id: ext.id }, data: { status: "IMPORTED", orderId: order.id, error: null, processedAt: new Date() } });
    await audit(ctx, { action: "integration.order_imported", entity: "Order", entityId: order.id, summary: `${ADAPTERS[ext.provider].displayName} order #${envelope.orderId} imported as ${order.orderNumber} (${formatMoney(order.total)})` });
    return { status: "IMPORTED" as const, orderId: order.id };
  } catch (error) {
    await ctx.db.externalOrder.update({ where: { id: ext.id }, data: { status: "FAILED", error: (error as Error).message.slice(0, 300), processedAt: new Date() } });
    return { status: "FAILED" as const, orderId: null };
  }
}

export async function rejectExternalOrder(ctx: ServiceContext, externalOrderId: string, reason: string) {
  const ext = await ctx.db.externalOrder.findUnique({ where: { id: externalOrderId } });
  if (!ext) throw new NotFoundError("External order");
  assertPermission(ctx, perm(ext.provider, "manage"));
  if (ext.status === "IMPORTED") throw new BusinessRuleError("Already accepted — cancel the order from Orders instead");
  await ctx.db.externalOrder.update({ where: { id: ext.id }, data: { status: "REJECTED", error: reason, processedAt: new Date() } });
}

/** Sandbox: push a realistic sample through the real webhook pipeline. */
export async function sendSandboxOrder(ctx: ServiceContext, provider: IntegrationProvider) {
  assertPermission(ctx, perm(provider, "manage"));
  const products = await ctx.db.product.findMany({ where: { deletedAt: null, isActive: true, isAvailable: true, isCombo: false, variants: { none: {} } }, take: 40, select: { sku: true, name: true, price: true } });
  if (products.length < 2) throw new BusinessRuleError("Add at least two available menu items first");
  const pick = [...products].sort(() => Math.random() - 0.5).slice(0, 2);
  const names = ["Aarav", "Diya", "Kabir", "Myra", "Vihaan", "Anvi", "Reyansh", "Kiara"];
  const envelope: AggregatorEnvelope = {
    orderId: `SANDBOX-${generateToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`,
    customer: { name: `${names[Math.floor(Math.random() * names.length)]} (sandbox)`, phone: null },
    fulfilment: "DELIVERY",
    deliveryAddress: "Sandbox address — not a real delivery",
    items: pick.map((p, i) => ({ sku: p.sku, name: p.name, quantity: i === 0 ? 2 : 1, price: p.price })),
    payment: { mode: "PREPAID", amount: pick.reduce((s, p, i) => s + p.price * (i === 0 ? 2 : 1), 0) },
    instructions: "Sandbox test order — safe to cancel",
  };
  return ingestExternalOrder(ctx, provider, envelope);
}

export function newWebhookSecret() {
  return `whsec_${generateToken(24)}`;
}

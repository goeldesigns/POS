/**
 * Unified order pipeline. Every order — POS counter, website, Swiggy/Zomato
 * import, admin — is created, priced, paid and completed through this module.
 * Prices are always recomputed from the database; client totals are never
 * trusted.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { OrderSource, OrderStatus, OrderType, PaymentMethod } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { calculateTotals, maxRedeemablePoints, type PricingDiscountInput, type PricingLineInput } from "@/lib/pricing";
import type { ServiceContext } from "../auth/load-context";
import { assertAnyPermission, assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { BusinessRuleError, NotFoundError } from "../errors";
import type { TenantTx } from "../tenant-db";
import { getProgram, reverseOrderLoyaltyTx, settleOrderLoyaltyTx } from "./loyalty";
import { deductInventoryForOrderTx } from "./stock";
import { claimTableTx, OPEN_ORDER_STATUSES, releaseTableTx } from "./table-state";

export { OPEN_ORDER_STATUSES };

export interface OrderLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  modifierIds?: string[];
  notes?: string | null;
}

export interface OrderDraftInput {
  source?: OrderSource;
  type: OrderType;
  tableId?: string | null;
  customerId?: string | null;
  customer?: { name: string; phone: string; email?: string | null } | null;
  guests?: number | null;
  notes?: string | null;
  deliveryAddress?: string | null;
  items: OrderLineInput[];
  discount?: { type: "PERCENT" | "FLAT"; value: number; reason?: string | null } | null;
  couponCode?: string | null;
  redeemPoints?: number | null;
  externalRef?: string | null;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number | null;
  reference?: string | null;
}

const SOURCE_LABEL: Record<OrderSource, string> = {
  POS: "POS",
  WEBSITE: "website",
  SWIGGY: "Swiggy",
  ZOMATO: "Zomato",
  ADMIN: "admin",
  OTHER: "external channel",
};

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

function isOpen(status: OrderStatus) {
  return (OPEN_ORDER_STATUSES as readonly string[]).includes(status);
}

async function loadSettings(tx: TenantTx, ctx: ServiceContext) {
  const settings = await tx.restaurantSettings.findUnique({ where: { restaurantId: ctx.restaurantId } });
  if (!settings) throw new NotFoundError("Restaurant settings");
  return settings;
}

type Settings = Awaited<ReturnType<typeof loadSettings>>;

function normalisePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

async function resolveCustomerTx(tx: TenantTx, ctx: ServiceContext, input: OrderDraftInput) {
  if (input.customerId) {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.deletedAt) throw new NotFoundError("Customer");
    return customer;
  }
  if (input.customer) {
    const phone = normalisePhone(input.customer.phone);
    const existing = await tx.customer.findFirst({ where: { phone } });
    if (existing) return existing;
    return tx.customer.create({
      data: {
        restaurantId: ctx.restaurantId,
        name: input.customer.name,
        phone,
        email: input.customer.email ?? null,
      },
    });
  }
  return null;
}

interface PricedDraft {
  items: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
  discounts: Prisma.OrderDiscountUncheckedCreateWithoutOrderInput[];
  taxes: Prisma.OrderTaxUncheckedCreateWithoutOrderInput[];
  totals: { subtotal: number; discountTotal: number; taxTotal: number; serviceCharge: number; roundOff: number; total: number };
  customer: { id: string; name: string; phone: string } | null;
  loyaltyPointsRedeemed: number;
  couponId: string | null;
}

/** Price a draft against live menu data. */
async function priceDraftTx(tx: TenantTx, ctx: ServiceContext, input: OrderDraftInput, settings: Settings): Promise<PricedDraft> {
  if (!input.items.length) throw new BusinessRuleError("Add at least one item");

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, deletedAt: null },
    include: {
      category: { select: { name: true } },
      taxRate: true,
      variants: true,
      modifierGroups: { include: { modifierGroup: { include: { modifiers: true } } } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const defaultTax = await tx.taxRate.findFirst({ where: { isDefault: true, isActive: true } });

  const pricingLines: PricingLineInput[] = [];
  const draftLines: Omit<Prisma.OrderItemUncheckedCreateWithoutOrderInput, "discount" | "taxAmount" | "lineTotal">[] = [];

  for (const line of input.items) {
    const product = byId.get(line.productId);
    if (!product) throw new NotFoundError("Menu item");
    if (!product.isActive || !product.isAvailable) throw new BusinessRuleError(`${product.name} is currently unavailable`);

    const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : null;
    if (line.variantId && !variant) throw new BusinessRuleError(`Choose a valid option for ${product.name}`);

    const selected = new Set(line.modifierIds ?? []);
    const chosen: { id: string; name: string; price: number }[] = [];
    for (const link of product.modifierGroups) {
      const group = link.modifierGroup;
      const picks = group.modifiers.filter((m) => m.isActive && selected.has(m.id));
      if (picks.length < group.minSelect) throw new BusinessRuleError(`Choose ${group.name} for ${product.name}`);
      if (picks.length > group.maxSelect) throw new BusinessRuleError(`Too many ${group.name} options for ${product.name}`);
      for (const m of picks) {
        chosen.push({ id: m.id, name: m.name, price: m.price });
        selected.delete(m.id);
      }
    }
    if (selected.size > 0) throw new BusinessRuleError(`Invalid add-on selected for ${product.name}`);

    const unitPrice = variant?.price ?? product.price;
    const modifiersTotal = chosen.reduce((a, m) => a + m.price, 0);
    const tax = product.taxRate?.isActive ? product.taxRate : defaultTax;

    pricingLines.push({
      unitPrice,
      quantity: line.quantity,
      modifiersTotal,
      taxRate: tax?.rate ?? 0,
      taxName: tax?.name,
    });
    draftLines.push({
      restaurantId: ctx.restaurantId,
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      variantName: variant?.name ?? null,
      categoryName: product.category.name,
      kitchenStation: product.kitchenStation,
      unitPrice,
      quantity: line.quantity,
      modifiers: chosen,
      modifiersTotal,
      taxRate: tax?.rate ?? 0,
      notes: line.notes ?? null,
    });
  }

  const customer = await resolveCustomerTx(tx, ctx, input);
  const config = {
    taxInclusive: settings.taxInclusive,
    serviceChargePercent: input.type === "DINE_IN" ? settings.serviceChargePercent : 0,
    roundOff: settings.roundOffTotals,
  };

  const discounts: (PricingDiscountInput & { reason?: string | null; couponCode?: string | null })[] = [];
  let couponId: string | null = null;

  if (input.discount && input.discount.value > 0) {
    assertPermission(ctx, "pos.apply_discount", "You don't have permission to apply discounts");
    discounts.push({ type: input.discount.type, value: input.discount.value, source: "MANUAL", reason: input.discount.reason });
  }

  if (input.couponCode) {
    const code = input.couponCode.trim().toUpperCase();
    const coupon = await tx.coupon.findFirst({ where: { code, isActive: true } });
    const now = new Date();
    if (!coupon) throw new BusinessRuleError(`Coupon ${code} is not valid`);
    if (coupon.validFrom && coupon.validFrom > now) throw new BusinessRuleError(`Coupon ${code} isn't active yet`);
    if (coupon.validTo && coupon.validTo < now) throw new BusinessRuleError(`Coupon ${code} has expired`);
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw new BusinessRuleError(`Coupon ${code} has reached its usage limit`);
    }
    const preview = calculateTotals(pricingLines, [], config);
    if (coupon.minOrder != null && preview.subtotal < coupon.minOrder) {
      throw new BusinessRuleError(`Coupon ${code} needs a minimum order of ${formatMoney(coupon.minOrder)}`);
    }
    couponId = coupon.id;
    discounts.push({
      type: coupon.type,
      value: coupon.value,
      maxAmount: coupon.maxDiscount ?? undefined,
      source: "COUPON",
      couponCode: coupon.code,
      reason: coupon.description ?? `Coupon ${coupon.code}`,
    });
  }

  let loyaltyPointsRedeemed = 0;
  if (input.redeemPoints && input.redeemPoints > 0) {
    if (!customer) throw new BusinessRuleError("Add a customer to redeem loyalty points");
    const program = await getProgram(tx, ctx);
    if (!program.isEnabled) throw new BusinessRuleError("The loyalty programme is switched off");
    const account = await tx.loyaltyAccount.findUnique({ where: { customerId: customer.id } });
    const beforeLoyalty = calculateTotals(pricingLines, discounts, config);
    const max = maxRedeemablePoints({
      balance: account?.balance ?? 0,
      billMinor: beforeLoyalty.subtotal - beforeLoyalty.discountTotal,
      pointValue: program.pointValue,
      maxRedeemPercent: program.maxRedeemPercent,
      minRedeemPoints: program.minRedeemPoints,
    });
    if (input.redeemPoints > max) {
      throw new BusinessRuleError(max === 0 ? "No points can be redeemed on this bill" : `At most ${max} points can be redeemed on this bill`);
    }
    loyaltyPointsRedeemed = input.redeemPoints;
    discounts.push({
      type: "FLAT",
      value: loyaltyPointsRedeemed * program.pointValue,
      source: "LOYALTY",
      reason: `${loyaltyPointsRedeemed} loyalty points`,
    });
  }

  const result = calculateTotals(pricingLines, discounts, config);

  return {
    items: draftLines.map((l, i) => ({
      ...l,
      discount: result.lines[i]!.discount,
      taxAmount: result.lines[i]!.tax,
      lineTotal: result.lines[i]!.total,
    })),
    discounts: result.discounts
      .map((d, i) => ({
        restaurantId: ctx.restaurantId,
        source: d.source ?? "MANUAL",
        type: d.type,
        value: d.value,
        amount: d.amount,
        reason: discounts[i]?.reason ?? null,
        couponCode: discounts[i]?.couponCode ?? null,
        appliedById: ctx.actor.userId,
      }))
      .filter((d) => d.amount > 0),
    taxes: result.taxBreakdown.map((t) => ({
      restaurantId: ctx.restaurantId,
      name: t.name,
      rate: t.rate,
      taxableAmount: t.taxable,
      amount: t.amount,
    })),
    totals: {
      subtotal: result.subtotal,
      discountTotal: result.discountTotal,
      taxTotal: result.taxTotal,
      serviceCharge: result.serviceCharge,
      roundOff: result.roundOff,
      total: result.total,
    },
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    loyaltyPointsRedeemed,
    couponId,
  };
}

function event(ctx: ServiceContext, type: string, message: string) {
  return { restaurantId: ctx.restaurantId, type, message, actorName: ctx.actor.name };
}

/** Identifies "the same line" across edits: product, size, add-ons and note. */
function lineSignature(i: { productId?: string | null; variantId?: string | null; modifiers?: unknown; notes?: string | null }) {
  const mods = ((i.modifiers as { id?: string }[] | null) ?? []).map((m) => m.id ?? "").sort().join(",");
  return `${i.productId ?? ""}|${i.variantId ?? ""}|${mods}|${i.notes ?? ""}`;
}

// ─── Create / update ────────────────────────────────────────────────────────

export async function createOrderTx(
  tx: TenantTx,
  ctx: ServiceContext,
  input: OrderDraftInput,
  status: "DRAFT" | "NEW",
) {
  assertAnyPermission(ctx, ["pos.create_order", "orders.create"]);
  const settings = await loadSettings(tx, ctx);
  const priced = await priceDraftTx(tx, ctx, input, settings);

  if (input.type === "DELIVERY" && settings.requireCustomerForDelivery && !priced.customer) {
    throw new BusinessRuleError("Add the customer's name and phone for delivery orders");
  }

  const tableId = input.type === "DINE_IN" && input.tableId ? input.tableId : null;
  if (tableId) await claimTableTx(tx, tableId);

  const counter = await tx.restaurantSettings.update({
    where: { restaurantId: ctx.restaurantId },
    data: { nextOrderNumber: { increment: 1 } },
    select: { nextOrderNumber: true, orderPrefix: true },
  });
  const number = counter.nextOrderNumber - 1;
  const source = input.source ?? "POS";
  const now = new Date();

  const order = await tx.order.create({
    data: {
      restaurantId: ctx.restaurantId,
      number,
      orderNumber: `${counter.orderPrefix}-${number}`,
      source,
      type: input.type,
      status,
      tableId,
      customerId: priced.customer?.id ?? null,
      customerName: priced.customer?.name ?? input.customer?.name ?? null,
      customerPhone: priced.customer?.phone ?? null,
      deliveryAddress: input.deliveryAddress ?? null,
      guests: input.guests ?? null,
      notes: input.notes ?? null,
      ...priced.totals,
      loyaltyPointsRedeemed: priced.loyaltyPointsRedeemed,
      externalRef: input.externalRef ?? null,
      createdById: ctx.actor.userId,
      placedAt: status === "NEW" ? now : null,
      items: { create: priced.items.map((i) => ({ ...i, createdAt: now })) },
      discounts: { create: priced.discounts },
      taxes: { create: priced.taxes },
      events: {
        create: event(ctx, "created", status === "DRAFT" ? "Saved as draft" : `Order placed via ${SOURCE_LABEL[source]}`),
      },
    },
  });

  if (priced.couponId) await tx.coupon.update({ where: { id: priced.couponId }, data: { usedCount: { increment: 1 } } });

  await audit(
    ctx,
    {
      action: "order.created",
      entity: "Order",
      entityId: order.id,
      summary: `${ctx.actor.name} created order ${order.orderNumber} (${formatMoney(order.total)})`,
      metadata: { source, type: input.type, status },
    },
    tx,
  );
  return order;
}

export async function updateOrderTx(
  tx: TenantTx,
  ctx: ServiceContext,
  orderId: string,
  input: OrderDraftInput,
  opts: { sendToKitchen?: boolean } = {},
) {
  assertAnyPermission(ctx, ["pos.edit_order", "orders.edit"]);
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Order");
  if (!isOpen(order.status)) throw new BusinessRuleError(`Order ${order.orderNumber} is closed`);
  if (order.paidTotal > 0) throw new BusinessRuleError("Items can't change after a payment has been taken");

  const settings = await loadSettings(tx, ctx);
  const priced = await priceDraftTx(tx, ctx, input, settings);

  const nextTableId = input.type === "DINE_IN" && input.tableId ? input.tableId : null;
  if (nextTableId !== order.tableId) {
    if (nextTableId) await claimTableTx(tx, nextTableId, order.id);
    if (order.tableId) await releaseTableTx(tx, order.tableId, "AVAILABLE", order.id);
  }

  const previousCoupons = await tx.orderDiscount.findMany({
    where: { orderId, source: "COUPON" },
    select: { couponCode: true },
  });
  const couponIsNew = priced.couponId
    ? !previousCoupons.some((d) => d.couponCode && input.couponCode?.trim().toUpperCase() === d.couponCode)
    : false;

  // Keep each unchanged line's original time so the kitchen can tell what was added later.
  const previousItems = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, variantId: true, modifiers: true, notes: true, quantity: true, createdAt: true },
  });
  const before = new Map(previousItems.map((i) => [lineSignature(i), i]));
  const now = new Date();
  const toKitchen = opts.sendToKitchen && order.status === "DRAFT";
  let added = false;
  const items = priced.items.map((i) => {
    const prev = before.get(lineSignature(i));
    const fresh = toKitchen || !prev || i.quantity > prev.quantity;
    if (fresh) added = true;
    return { ...i, createdAt: fresh ? now : prev!.createdAt };
  });
  // More food for a table the kitchen already finished: the ticket goes back on the board.
  const backToKitchen = !!opts.sendToKitchen && added && (order.status === "READY" || order.status === "SERVED");

  await tx.orderItem.deleteMany({ where: { orderId } });
  await tx.orderDiscount.deleteMany({ where: { orderId } });
  await tx.orderTax.deleteMany({ where: { orderId } });

  const updated = await tx.order.update({
    where: { id: orderId },
    data: {
      type: input.type,
      tableId: nextTableId,
      customerId: priced.customer?.id ?? null,
      customerName: priced.customer?.name ?? null,
      customerPhone: priced.customer?.phone ?? null,
      deliveryAddress: input.deliveryAddress ?? null,
      guests: input.guests ?? null,
      notes: input.notes ?? null,
      ...priced.totals,
      loyaltyPointsRedeemed: priced.loyaltyPointsRedeemed,
      ...(toKitchen || backToKitchen ? { status: "NEW", placedAt: now } : {}),
      items: { create: items },
      discounts: { create: priced.discounts },
      taxes: { create: priced.taxes },
      events: { create: event(ctx, "updated", toKitchen ? "Sent to kitchen" : backToKitchen ? "More items sent to the kitchen" : "Order items updated") },
    },
  });
  if (priced.couponId && couponIsNew) {
    await tx.coupon.update({ where: { id: priced.couponId }, data: { usedCount: { increment: 1 } } });
  }
  return updated;
}

/** POS "Save as draft" / "Send to kitchen". */
export async function saveOrder(
  ctx: ServiceContext,
  input: OrderDraftInput & { orderId?: string | null },
  mode: "DRAFT" | "KITCHEN",
) {
  return ctx.db.$transaction(async (tx) => {
    if (input.orderId) return updateOrderTx(tx, ctx, input.orderId, input, { sendToKitchen: mode === "KITCHEN" });
    return createOrderTx(tx, ctx, input, mode === "DRAFT" ? "DRAFT" : "NEW");
  }, TX_OPTIONS);
}

// ─── Payments & completion ──────────────────────────────────────────────────

export async function recordPaymentsTx(tx: TenantTx, ctx: ServiceContext, orderId: string, payments: PaymentInput[]) {
  assertPermission(ctx, "pos.process_payment", "You don't have permission to take payments");
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Order");
  if (order.status === "CANCELLED" || order.status === "REFUNDED") throw new BusinessRuleError(`Order ${order.orderNumber} is closed`);
  if (order.paymentStatus === "PAID") throw new BusinessRuleError(`Order ${order.orderNumber} is already paid`);

  const due = order.total - order.paidTotal;
  const amount = payments.reduce((a, p) => a + p.amount, 0);
  if (amount <= 0) throw new BusinessRuleError("Enter a payment amount");
  if (amount > due) throw new BusinessRuleError(`Payment exceeds the amount due (${formatMoney(due)})`);

  const rows = payments.map((p) => {
    let received = p.receivedAmount ?? p.amount;
    if (p.method !== "CASH") received = p.amount;
    if (received < p.amount) throw new BusinessRuleError("Cash received is less than the amount");
    return {
      restaurantId: ctx.restaurantId,
      orderId,
      kind: "PAYMENT" as const,
      method: p.method,
      amount: p.amount,
      receivedAmount: received,
      changeAmount: received - p.amount,
      reference: p.reference ?? null,
      processedById: ctx.actor.userId,
    };
  });
  await tx.orderPayment.createMany({ data: rows });

  const paidTotal = order.paidTotal + amount;
  const paid = paidTotal >= order.total;
  const label = rows.map((r) => `${r.method} ${formatMoney(r.amount)}`).join(" + ");

  const updated = await tx.order.update({
    where: { id: orderId },
    data: {
      paidTotal,
      paymentStatus: paid ? "PAID" : "PARTIALLY_PAID",
      ...(order.status === "DRAFT" ? { status: "NEW", placedAt: new Date() } : {}),
      events: {
        create: [
          event(ctx, "payment", `${rows.length > 1 ? "Split payment" : "Payment"} received: ${label}`),
          ...(order.status === "DRAFT" ? [event(ctx, "status", "Sent to kitchen")] : []),
        ],
      },
    },
  });

  await audit(
    ctx,
    {
      action: "payment.received",
      entity: "Order",
      entityId: orderId,
      summary: `${ctx.actor.name} processed payment of ${formatMoney(amount)} for ${order.orderNumber}`,
      metadata: { methods: rows.map((r) => r.method) },
    },
    tx,
  );

  // Food status and payment are separate. A paid order goes to (or stays with) the kitchen and
  // closes when the kitchen completes it; one the kitchen already served closes now. Counters
  // without a kitchen display (autoCompleteOnPayment) close paid POS orders straight away.
  const settings = await loadSettings(tx, ctx);
  if (paid && (updated.status === "SERVED" || (settings.autoCompleteOnPayment && updated.source === "POS"))) {
    return completeOrderTx(tx, ctx, updated.id, settings);
  }
  return updated;
}

/** Completion side effects: stock deduction, loyalty, customer stats, table release. */
export async function completeOrderTx(tx: TenantTx, ctx: ServiceContext, orderId: string, settings?: Settings, opts: { keepTable?: boolean } = {}) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Order");
  if (order.status === "COMPLETED") return order;
  if (!isOpen(order.status)) throw new BusinessRuleError(`Order ${order.orderNumber} is closed`);
  if (order.paymentStatus !== "PAID") {
    throw new BusinessRuleError(`Collect ${formatMoney(order.total - order.paidTotal)} before completing ${order.orderNumber}`);
  }
  const s = settings ?? (await loadSettings(tx, ctx));

  await deductInventoryForOrderTx(tx, ctx, order, { allowNegative: s.allowNegativeStock });
  const earned = await settleOrderLoyaltyTx(tx, ctx, order);

  if (order.customerId) {
    await tx.customer.update({
      where: { id: order.customerId },
      data: { totalOrders: { increment: 1 }, totalSpend: { increment: order.total }, lastVisitAt: new Date() },
    });
  }
  if (order.tableId && !opts.keepTable) await releaseTableTx(tx, order.tableId, s.freeTableAfterPayment ? "AVAILABLE" : "CLEANING", order.id);

  const now = new Date();
  return tx.order.update({
    where: { id: order.id },
    data: {
      status: "COMPLETED",
      completedAt: now,
      readyAt: order.readyAt ?? now,
      servedAt: order.servedAt ?? now,
      loyaltyPointsEarned: earned,
      events: {
        create: event(ctx, "completed", earned > 0 ? `Order completed · ${earned} loyalty points earned` : "Order completed"),
      },
    },
  });
}

/** POS "Charge": create/update the order and take payment atomically. */
export async function checkout(ctx: ServiceContext, input: OrderDraftInput & { orderId?: string | null; payments: PaymentInput[] }) {
  return ctx.db.$transaction(async (tx) => {
    let orderId = input.orderId ?? null;
    if (orderId) {
      const existing = await tx.order.findUnique({ where: { id: orderId }, select: { paidTotal: true } });
      if (!existing) throw new NotFoundError("Order");
      if (existing.paidTotal === 0) await updateOrderTx(tx, ctx, orderId, input, { sendToKitchen: true });
    } else {
      orderId = (await createOrderTx(tx, ctx, input, "NEW")).id;
    }
    return recordPaymentsTx(tx, ctx, orderId, input.payments);
  }, TX_OPTIONS);
}

export async function recordPayments(ctx: ServiceContext, orderId: string, payments: PaymentInput[]) {
  return ctx.db.$transaction((tx) => recordPaymentsTx(tx, ctx, orderId, payments), TX_OPTIONS);
}

// ─── Kitchen status ─────────────────────────────────────────────────────────

const TRANSITIONS: Record<string, OrderStatus[]> = {
  DRAFT: ["NEW"],
  NEW: ["PREPARING", "READY", "SERVED", "COMPLETED"],
  PREPARING: ["READY", "SERVED", "COMPLETED"],
  READY: ["SERVED", "COMPLETED"],
};

/**
 * Kitchen progress. "Complete" (SERVED, or COMPLETED as an alias) means the food is handed
 * over: a paid order closes; an unpaid one (table service, pay after the meal) leaves the
 * board as SERVED and closes when the bill is settled.
 */
export async function updateOrderStatus(ctx: ServiceContext, orderId: string, status: "NEW" | "PREPARING" | "READY" | "SERVED" | "COMPLETED") {
  assertAnyPermission(ctx, ["orders.edit", "pos.edit_order"]);
  return ctx.db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError("Order");
    if (!(TRANSITIONS[order.status] ?? []).includes(status)) {
      throw new BusinessRuleError(`Can't move ${order.orderNumber} from ${order.status.toLowerCase()} to ${status.toLowerCase()}`);
    }
    const now = new Date();
    if (status === "SERVED" || status === "COMPLETED") {
      // Guests who paid up front are still eating — the table stays occupied until staff free it.
      if (order.paymentStatus === "PAID") return completeOrderTx(tx, ctx, order.id, undefined, { keepTable: order.type === "DINE_IN" });
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: "SERVED",
          servedAt: now,
          readyAt: order.readyAt ?? now,
          events: { create: event(ctx, "status", `${order.type === "DINE_IN" ? "Served" : "Handed over"} · ${formatMoney(order.total - order.paidTotal)} still to pay`) },
        },
      });
    }
    const messages = { NEW: "Sent to kitchen", PREPARING: "Preparation started", READY: "Marked ready" } as const;
    return tx.order.update({
      where: { id: order.id },
      data: {
        status,
        ...(status === "NEW" ? { placedAt: now } : {}),
        ...(status === "PREPARING" ? { preparingAt: now } : {}),
        ...(status === "READY" ? { readyAt: now } : {}),
        events: { create: event(ctx, "status", messages[status]) },
      },
    });
  }, TX_OPTIONS);
}

// ─── Cancel / refund ────────────────────────────────────────────────────────

export async function cancelOrder(ctx: ServiceContext, orderId: string, reason: string) {
  assertAnyPermission(ctx, ["orders.cancel", "pos.void_order"]);
  return ctx.db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError("Order");
    if (!isOpen(order.status)) throw new BusinessRuleError(`Order ${order.orderNumber} is already closed`);
    const held = order.paidTotal - order.refundedTotal;
    if (held > 0) throw new BusinessRuleError(`Refund ${formatMoney(held)} before cancelling this order`);

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
        events: { create: event(ctx, "cancelled", `Cancelled — ${reason}`) },
      },
    });
    if (order.tableId) await releaseTableTx(tx, order.tableId, "AVAILABLE", order.id);
    await audit(
      ctx,
      { action: "order.cancelled", entity: "Order", entityId: order.id, summary: `Order ${order.orderNumber} cancelled by ${ctx.actor.name}`, metadata: { reason } },
      tx,
    );
    return updated;
  }, TX_OPTIONS);
}

export async function refundOrder(
  ctx: ServiceContext,
  input: { orderId: string; amount: number; method: PaymentMethod; reason: string },
) {
  assertAnyPermission(ctx, ["orders.refund", "pos.refund"]);
  return ctx.db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new NotFoundError("Order");
    const refundable = order.paidTotal - order.refundedTotal;
    if (refundable <= 0) throw new BusinessRuleError("There is nothing left to refund on this order");
    if (input.amount > refundable) throw new BusinessRuleError(`You can refund at most ${formatMoney(refundable)}`);

    await tx.orderPayment.create({
      data: {
        restaurantId: ctx.restaurantId,
        orderId: order.id,
        kind: "REFUND",
        method: input.method,
        amount: input.amount,
        notes: input.reason,
        processedById: ctx.actor.userId,
      },
    });

    const refundedTotal = order.refundedTotal + input.amount;
    const full = refundedTotal >= order.paidTotal;
    const wasCompleted = order.status === "COMPLETED";

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        refundedTotal,
        paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED",
        ...(full ? { status: "REFUNDED", refundedAt: new Date() } : {}),
        events: {
          create: event(ctx, "refund", `${full ? "Full" : "Partial"} refund of ${formatMoney(input.amount)} via ${input.method} — ${input.reason}`),
        },
      },
    });

    if (wasCompleted && order.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: order.customerId }, select: { totalSpend: true } });
      await tx.customer.update({
        where: { id: order.customerId },
        data: { totalSpend: Math.max(0, (customer?.totalSpend ?? 0) - input.amount) },
      });
    }
    if (full && wasCompleted) await reverseOrderLoyaltyTx(tx, ctx, order);
    if (full && order.tableId && isOpen(order.status)) await releaseTableTx(tx, order.tableId, "AVAILABLE", order.id);

    await audit(
      ctx,
      {
        action: "order.refunded",
        entity: "Order",
        entityId: order.id,
        summary: `${ctx.actor.name} refunded ${formatMoney(input.amount)} on ${order.orderNumber}`,
        metadata: { reason: input.reason, method: input.method },
      },
      tx,
    );
    return updated;
  }, TX_OPTIONS);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Recreate an order's items as a new draft at today's prices. */
export async function duplicateOrder(ctx: ServiceContext, orderId: string) {
  const source = await ctx.db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!source) throw new NotFoundError("Order");
  const items = source.items
    .filter((i) => i.productId)
    .map((i) => ({
      productId: i.productId!,
      variantId: i.variantId,
      quantity: i.quantity,
      modifierIds: ((i.modifiers as { id: string }[] | null) ?? []).map((m) => m.id),
      notes: i.notes,
    }));
  if (!items.length) throw new BusinessRuleError("None of these items are on the menu any more");
  return ctx.db.$transaction(
    (tx) =>
      createOrderTx(
        tx,
        ctx,
        {
          source: "POS",
          type: source.type === "DINE_IN" ? "TAKEAWAY" : source.type,
          customerId: source.customerId,
          deliveryAddress: source.deliveryAddress,
          items,
        },
        "DRAFT",
      ),
    TX_OPTIONS,
  );
}

export async function transferOrderTable(ctx: ServiceContext, orderId: string, tableId: string) {
  assertPermission(ctx, "tables.assign_orders");
  return ctx.db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError("Order");
    if (!isOpen(order.status)) throw new BusinessRuleError(`Order ${order.orderNumber} is closed`);
    if (order.tableId === tableId) return order;
    const table = await claimTableTx(tx, tableId, order.id);
    if (order.tableId) await releaseTableTx(tx, order.tableId, "AVAILABLE", order.id);
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { tableId, type: "DINE_IN", events: { create: event(ctx, "table", `Moved to ${table.name}`) } },
    });
    await audit(ctx, { action: "order.transferred", entity: "Order", entityId: order.id, summary: `${order.orderNumber} moved to ${table.name}` }, tx);
    return updated;
  }, TX_OPTIONS);
}

export async function getOrderDetail(ctx: ServiceContext, orderId: string) {
  const order = await ctx.db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      discounts: true,
      taxes: true,
      events: { orderBy: { createdAt: "asc" } },
      table: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true, email: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) throw new NotFoundError("Order");
  return order;
}

export type OrderDetail = Awaited<ReturnType<typeof getOrderDetail>>;

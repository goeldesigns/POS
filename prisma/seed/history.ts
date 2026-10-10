import type { Prisma } from "../../src/generated/prisma/client";
import type { OrderSource, OrderType, PaymentMethod } from "../../src/generated/prisma/enums";
import { calculateTotals, loyaltyPointsFor, type PricingDiscountInput } from "../../src/lib/pricing";
import { prisma } from "../../src/server/db";
import type { MenuItemSeed } from "./menus";
import type { Random } from "./random";
import { seedId } from "./random";
import { addMinutes, istAt, istNowHours, istWeekday } from "./time";

export interface SeededProduct {
  id: string;
  seed: MenuItemSeed;
  categoryName: string;
  variants: { id: string; name: string; price: number }[];
  modifiers: { id: string; name: string; price: number }[];
}

export interface HistoryConfig {
  restaurantId: string;
  days: number;
  baseDaily: number;
  typeMix: Partial<Record<OrderType, number>>;
  serviceChargePercent: number;
  taxRate: number;
  taxName: string;
  pointsPerHundred: number;
  pointValue: number;
  products: SeededProduct[];
  customers: { id: string; name: string; phone: string; createdAt: Date }[];
  tables: { id: string; capacity: number }[];
  staff: { cashier: string[]; floor: string[] };
  coupons: { code: string; type: "PERCENT" | "FLAT"; value: number; maxAmount?: number; minOrder?: number }[];
  orderPrefix: string;
  startNumber: number;
  loyaltyEnabled: boolean;
}

const HOUR_WEIGHTS: [number, number][] = [
  [8, 0.6], [9, 1], [10, 1.2], [11, 1.4], [12, 4], [13, 7], [14, 6], [15, 3], [16, 2],
  [17, 2], [18, 3], [19, 6], [20, 9], [21, 8], [22, 4],
];

const DOW_FACTOR = [1.35, 0.85, 0.88, 0.92, 0.97, 1.15, 1.45]; // Sun..Sat

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function insertMany<T>(label: string, rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (const batch of chunk(rows, 1500)) await insert(batch);
  if (rows.length) console.log(`   · ${rows.length.toLocaleString("en-IN")} ${label}`);
}

function buildBasket(rnd: Random, products: SeededProduct[], type: OrderType, guests: number) {
  const byRole = (roles: MenuItemSeed["role"][]) => products.filter((p) => roles.includes(p.seed.role));
  const basket = new Map<string, { product: SeededProduct; qty: number; variant?: SeededProduct["variants"][number]; modifier?: SeededProduct["modifiers"][number] }>();
  const add = (p: SeededProduct | undefined, qty = 1) => {
    if (!p) return;
    const existing = basket.get(p.id);
    if (existing) existing.qty += qty;
    else {
      const variant = p.variants.length ? (rnd.chance(0.7) ? p.variants[0] : rnd.pick(p.variants)) : undefined;
      const modifier = p.modifiers.length && rnd.chance(0.12) ? rnd.pick(p.modifiers) : undefined;
      basket.set(p.id, { product: p, qty, variant, modifier });
    }
  };
  const weightedPick = (pool: SeededProduct[]) => (pool.length ? rnd.weighted(pool, (p) => p.seed.weight) : undefined);

  const mains = byRole(["curry", "main", "rice", "combo"]);
  const curries = byRole(["curry"]);
  const breads = byRole(["bread"]);
  const starters = byRole(["starter"]);
  const drinks = byRole(["drink"]);
  const desserts = byRole(["dessert"]);
  const sides = byRole(["side", "snack"]);

  const cafe = curries.length === 0 && breads.length === 0;
  const people = Math.max(1, guests);

  if (cafe) {
    for (let i = 0; i < Math.max(1, Math.round(people * rnd.jitter(0.3))); i++) add(weightedPick(drinks));
    if (rnd.chance(0.6)) add(weightedPick([...mains, ...sides]));
    if (rnd.chance(0.25)) add(weightedPick(desserts));
    return [...basket.values()];
  }

  const mainCount = Math.max(1, Math.round(people * 0.7 * rnd.jitter(0.3)));
  for (let i = 0; i < mainCount; i++) add(weightedPick(mains));
  const curryCount = [...basket.values()].filter((b) => b.product.seed.role === "curry").length;
  if (curryCount > 0 && breads.length) add(weightedPick(breads), Math.max(1, Math.round(people * 1.3 * rnd.jitter(0.4))));
  if (curryCount === 0 && curries.length && rnd.chance(type === "DINE_IN" ? 0.3 : 0.15)) add(weightedPick(curries));
  if (rnd.chance(type === "DINE_IN" ? 0.45 : 0.2)) add(weightedPick(starters));
  if (rnd.chance(type === "DINE_IN" ? 0.55 : 0.3)) add(weightedPick(drinks), rnd.int(1, Math.min(4, people)));
  if (rnd.chance(type === "DINE_IN" ? 0.3 : 0.15)) add(weightedPick(desserts), rnd.chance(0.3) ? 2 : 1);
  if (rnd.chance(0.12)) add(weightedPick(sides));
  return [...basket.values()];
}

/**
 * Generate and bulk-insert historical orders. Bypasses the order service for
 * speed but uses the same pricing engine so totals match live behaviour.
 * Returns the last order number used.
 */
export async function generateOrderHistory(rnd: Random, cfg: HistoryConfig, now = new Date()) {
  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  const payments: Prisma.OrderPaymentCreateManyInput[] = [];
  const discounts: Prisma.OrderDiscountCreateManyInput[] = [];
  const taxes: Prisma.OrderTaxCreateManyInput[] = [];
  const events: Prisma.OrderEventCreateManyInput[] = [];
  const loyaltyTxns: Prisma.LoyaltyTransactionCreateManyInput[] = [];

  const loyalty = new Map<string, { accountId: string; balance: number; earned: number; redeemed: number; createdAt: Date }>();
  const customerStats = new Map<string, { orders: number; spend: number; first: Date; last: Date }>();

  const regulars = cfg.customers.slice(0, Math.ceil(cfg.customers.length * 0.35));
  const typeEntries = Object.entries(cfg.typeMix) as [OrderType, number][];
  let number = cfg.startNumber;
  const nowHours = istNowHours(now);
  const rid = cfg.restaurantId;

  for (let day = cfg.days - 1; day >= 0; day--) {
    const trend = 0.85 + 0.15 * (1 - day / cfg.days);
    let count = Math.round(cfg.baseDaily * DOW_FACTOR[istWeekday(day, now)]! * trend * rnd.jitter(0.18));
    const hours = HOUR_WEIGHTS.filter(([h]) => day > 0 || h + 1 <= nowHours - 0.5);
    if (day === 0) count = Math.round(count * (hours.reduce((s, [, w]) => s + w, 0) / HOUR_WEIGHTS.reduce((s, [, w]) => s + w, 0)));
    if (!hours.length) continue;

    const stamps = Array.from({ length: count }, () => {
      const [hour] = rnd.weighted(hours, ([, w]) => w);
      return istAt(day, hour, rnd.int(0, 59), now);
    }).sort((a, b) => a.getTime() - b.getTime());

    for (const createdAt of stamps) {
      if (createdAt.getTime() > now.getTime() - 35 * 60_000) continue;
      const type = rnd.weighted(typeEntries, ([, w]) => w)[0];
      let source: OrderSource = "POS";
      if (type === "ONLINE") source = rnd.weighted<OrderSource>(["SWIGGY", "ZOMATO", "WEBSITE"], (s) => (s === "SWIGGY" ? 5 : s === "ZOMATO" ? 4 : 1));

      const guests = type === "DINE_IN" ? rnd.weighted([1, 2, 2, 3, 4, 4, 5, 6], () => 1) : rnd.int(1, 3);
      const basket = buildBasket(rnd, cfg.products, type, guests);
      if (!basket.length) continue;

      const wantsCustomer = type === "DELIVERY" || (type === "DINE_IN" && rnd.chance(0.38)) || (type === "TAKEAWAY" && rnd.chance(0.42));
      // Only guests who had already joined by this order's date.
      const joinedRegulars = regulars.filter((c) => c.createdAt <= createdAt);
      const joinedAll = cfg.customers.filter((c) => c.createdAt <= createdAt);
      const pool = joinedRegulars.length && rnd.chance(0.6) ? joinedRegulars : joinedAll;
      const customer = wantsCustomer && pool.length ? rnd.pick(pool) : null;
      const table = type === "DINE_IN" && cfg.tables.length ? rnd.pick(cfg.tables) : null;

      const lines = basket.map((b) => ({
        unitPrice: b.variant?.price ?? Math.round(b.product.seed.price * 100),
        quantity: b.qty,
        modifiersTotal: b.modifier?.price ?? 0,
        taxRate: cfg.taxRate,
        taxName: cfg.taxName,
      }));

      const discountInputs: (PricingDiscountInput & { reason: string; couponCode?: string })[] = [];
      if (rnd.chance(0.05)) discountInputs.push({ type: "PERCENT", value: 10, source: "MANUAL", reason: "Regular guest" });
      else if (cfg.coupons.length && rnd.chance(0.04)) {
        const c = rnd.pick(cfg.coupons);
        const subtotal = lines.reduce((s, l) => s + (l.unitPrice + l.modifiersTotal) * l.quantity, 0);
        if (!c.minOrder || subtotal >= c.minOrder) {
          discountInputs.push({ type: c.type, value: c.value, maxAmount: c.maxAmount, source: "COUPON", reason: `Coupon ${c.code}`, couponCode: c.code });
        }
      }

      let account = customer && cfg.loyaltyEnabled ? loyalty.get(customer.id) : undefined;
      if (customer && cfg.loyaltyEnabled && !account) {
        account = { accountId: seedId("la"), balance: 50, earned: 50, redeemed: 0, createdAt };
        loyalty.set(customer.id, account);
        loyaltyTxns.push({
          id: seedId("lt"), restaurantId: rid, accountId: account.accountId, customerId: customer.id, type: "BONUS",
          points: 50, balanceAfter: 50, description: "Welcome bonus", createdAt, expiresAt: addMinutes(createdAt, 365 * 1440), actorName: "System",
        });
      }
      let redeemPoints = 0;
      if (account && account.balance >= 300 && rnd.chance(0.14)) {
        redeemPoints = Math.min(200, Math.floor(account.balance / 50) * 50);
        discountInputs.push({ type: "FLAT", value: redeemPoints * cfg.pointValue, source: "LOYALTY", reason: `${redeemPoints} loyalty points` });
      }

      const totals = calculateTotals(lines, discountInputs, {
        taxInclusive: false,
        serviceChargePercent: type === "DINE_IN" ? cfg.serviceChargePercent : 0,
        roundOff: true,
      });

      const roll = rnd.next();
      const status = roll < 0.023 ? "CANCELLED" : roll < 0.03 ? "REFUNDED" : "COMPLETED";
      const id = seedId("ord");
      const orderNumber = `${cfg.orderPrefix}-${number}`;
      const staffPool = type === "DINE_IN" ? [...cfg.staff.floor, ...cfg.staff.cashier] : cfg.staff.cashier;
      const createdById = staffPool.length ? rnd.pick(staffPool) : null;
      const prepMinutes = Math.max(...basket.map((b) => b.product.seed.prep ?? 10));
      const readyAt = addMinutes(createdAt, prepMinutes + rnd.int(2, 8));
      const completedAt = addMinutes(createdAt, type === "DINE_IN" ? rnd.int(40, 85) : type === "TAKEAWAY" ? prepMinutes + rnd.int(5, 15) : prepMinutes + rnd.int(20, 45));

      if (redeemPoints && status !== "CANCELLED") {
        account!.balance -= redeemPoints;
        account!.redeemed += redeemPoints;
        loyaltyTxns.push({
          id: seedId("lt"), restaurantId: rid, accountId: account!.accountId, customerId: customer!.id, orderId: id, type: "REDEEM",
          points: -redeemPoints, balanceAfter: account!.balance, description: `Redeemed on ${orderNumber}`, createdAt: completedAt, actorName: "System",
        });
      }
      let earned = 0;
      if (account && status === "COMPLETED") {
        earned = loyaltyPointsFor(totals.total, cfg.pointsPerHundred);
        if (earned > 0) {
          account.balance += earned;
          account.earned += earned;
          loyaltyTxns.push({
            id: seedId("lt"), restaurantId: rid, accountId: account.accountId, customerId: customer!.id, orderId: id, type: "EARN",
            points: earned, balanceAfter: account.balance, description: `Earned on ${orderNumber}`, createdAt: completedAt,
            expiresAt: addMinutes(completedAt, 365 * 1440), actorName: "System",
          });
        }
      }

      const paid = status !== "CANCELLED";
      orders.push({
        id, restaurantId: rid, number, orderNumber, source, type, status,
        paymentStatus: status === "CANCELLED" ? "UNPAID" : status === "REFUNDED" ? "REFUNDED" : "PAID",
        tableId: table?.id ?? null,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? (source === "SWIGGY" || source === "ZOMATO" ? rnd.pick(["Aarav", "Diya", "Kabir", "Myra", "Vihaan", "Anvi"]) : null),
        customerPhone: customer?.phone ?? null,
        guests: type === "DINE_IN" ? guests : null,
        externalRef: source === "SWIGGY" ? `SWG${rnd.int(100000000, 999999999)}` : source === "ZOMATO" ? `ZMT${rnd.int(1000000000, 9999999999)}` : null,
        subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal,
        serviceCharge: totals.serviceCharge, roundOff: totals.roundOff, total: totals.total,
        paidTotal: paid ? totals.total : 0,
        refundedTotal: status === "REFUNDED" ? totals.total : 0,
        loyaltyPointsEarned: earned,
        loyaltyPointsRedeemed: status === "CANCELLED" ? 0 : redeemPoints,
        inventoryDeducted: status !== "CANCELLED",
        createdById,
        placedAt: createdAt,
        preparingAt: status === "CANCELLED" ? null : addMinutes(createdAt, 2),
        readyAt: status === "CANCELLED" ? null : readyAt,
        completedAt: status === "CANCELLED" ? null : completedAt,
        cancelledAt: status === "CANCELLED" ? addMinutes(createdAt, rnd.int(3, 15)) : null,
        cancelReason: status === "CANCELLED" ? rnd.pick(["Guest left before order was served", "Duplicate order", "Item unavailable", "Customer changed mind"]) : null,
        refundedAt: status === "REFUNDED" ? addMinutes(completedAt, rnd.int(5, 60)) : null,
        createdAt,
        updatedAt: completedAt,
      });

      basket.forEach((b, i) => {
        const priced = totals.lines[i]!;
        items.push({
          id: seedId("oi"), restaurantId: rid, orderId: id, productId: b.product.id, variantId: b.variant?.id ?? null,
          name: b.product.seed.name, variantName: b.variant?.name ?? null, categoryName: b.product.categoryName,
          kitchenStation: b.product.seed.station ?? null, unitPrice: lines[i]!.unitPrice, quantity: b.qty,
          modifiers: b.modifier ? [b.modifier] : [], modifiersTotal: b.modifier?.price ?? 0,
          discount: priced.discount, taxRate: cfg.taxRate, taxAmount: priced.tax, lineTotal: priced.total, createdAt,
        });
      });
      totals.discounts.forEach((d, i) => {
        if (d.amount <= 0) return;
        discounts.push({
          id: seedId("od"), restaurantId: rid, orderId: id, source: d.source ?? "MANUAL", type: d.type, value: d.value,
          amount: d.amount, reason: discountInputs[i]?.reason ?? null, couponCode: discountInputs[i]?.couponCode ?? null, createdAt,
        });
      });
      for (const t of totals.taxBreakdown) {
        taxes.push({ id: seedId("tx"), restaurantId: rid, orderId: id, name: t.name, rate: t.rate, taxableAmount: t.taxable, amount: t.amount });
      }

      events.push({ id: seedId("ev"), restaurantId: rid, orderId: id, type: "created", message: `Order placed via ${source === "POS" ? "POS" : source.charAt(0) + source.slice(1).toLowerCase()}`, createdAt });
      if (status === "CANCELLED") {
        events.push({ id: seedId("ev"), restaurantId: rid, orderId: id, type: "cancelled", message: "Order cancelled", createdAt: addMinutes(createdAt, 5) });
      } else {
        const method: PaymentMethod =
          type === "ONLINE"
            ? "OTHER"
            : rnd.weighted<PaymentMethod>(["UPI", "CARD", "CASH", "WALLET"], (m) => ({ UPI: 46, CARD: 27, CASH: 24, WALLET: 3 })[m as "UPI"]);
        const split = type !== "ONLINE" && totals.total > 150000 && rnd.chance(0.12);
        const parts = split ? [Math.round(totals.total / 200) * 100, 0] : [totals.total];
        if (split) parts[1] = totals.total - parts[0]!;
        parts.forEach((amount, idx) => {
          const m = idx === 0 ? method : method === "CASH" ? "UPI" : "CASH";
          const received = m === "CASH" ? Math.ceil(amount / 10000) * 10000 : amount;
          payments.push({
            id: seedId("pay"), restaurantId: rid, orderId: id, kind: "PAYMENT", method: m, amount,
            receivedAmount: received, changeAmount: received - amount,
            reference: m === "UPI" ? `UPI${rnd.int(100000000, 999999999)}` : m === "CARD" ? `XXXX${rnd.int(1000, 9999)}` : m === "OTHER" ? `Settled by ${source}` : null,
            processedById: createdById, createdAt: addMinutes(completedAt, -2),
          });
        });
        events.push({ id: seedId("ev"), restaurantId: rid, orderId: id, type: "payment", message: `Payment received: ${method}`, createdAt: addMinutes(completedAt, -2) });
        events.push({ id: seedId("ev"), restaurantId: rid, orderId: id, type: "completed", message: "Order completed", createdAt: completedAt });
        if (status === "REFUNDED") {
          payments.push({
            id: seedId("pay"), restaurantId: rid, orderId: id, kind: "REFUND", method: method === "OTHER" ? "OTHER" : method,
            amount: totals.total, notes: "Food quality complaint", processedById: createdById, createdAt: addMinutes(completedAt, 20),
          });
          events.push({ id: seedId("ev"), restaurantId: rid, orderId: id, type: "refund", message: "Full refund — food quality complaint", createdAt: addMinutes(completedAt, 20) });
        }
        if (customer && status === "COMPLETED") {
          const s = customerStats.get(customer.id) ?? { orders: 0, spend: 0, first: createdAt, last: completedAt };
          s.orders += 1;
          s.spend += totals.total;
          s.last = completedAt;
          customerStats.set(customer.id, s);
        }
      }
      number += 1;
    }
  }

  await insertMany("orders", orders, (b) => prisma.order.createMany({ data: b }));
  await insertMany("order items", items, (b) => prisma.orderItem.createMany({ data: b }));
  await insertMany("payments", payments, (b) => prisma.orderPayment.createMany({ data: b }));
  await insertMany("discounts", discounts, (b) => prisma.orderDiscount.createMany({ data: b }));
  await insertMany("tax lines", taxes, (b) => prisma.orderTax.createMany({ data: b }));
  await insertMany("order events", events, (b) => prisma.orderEvent.createMany({ data: b }));

  if (loyalty.size) {
    await insertMany(
      "loyalty accounts",
      [...loyalty.entries()].map(([customerId, a]) => ({
        id: a.accountId, restaurantId: rid, customerId, balance: a.balance, lifetimeEarned: a.earned,
        lifetimeRedeemed: a.redeemed, createdAt: a.createdAt,
      })),
      (b) => prisma.loyaltyAccount.createMany({ data: b }),
    );
    await insertMany("loyalty transactions", loyaltyTxns, (b) => prisma.loyaltyTransaction.createMany({ data: b }));
  }

  const joined = new Map(cfg.customers.map((c) => [c.id, c.createdAt]));
  for (const [customerId, s] of customerStats) {
    // A guest can't have ordered before they became a customer.
    const since = joined.get(customerId);
    await prisma.customer.update({
      where: { id: customerId },
      data: { totalOrders: s.orders, totalSpend: s.spend, lastVisitAt: s.last, ...(since && s.first < since ? { createdAt: s.first } : {}) },
    });
  }

  return { lastNumber: number - 1, orderCount: orders.length };
}

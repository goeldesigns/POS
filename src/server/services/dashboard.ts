import type { ServiceContext } from "../auth/load-context";
import { hasPermission } from "../auth/guards-core";
import { bucketKeys, bucketLabel, bucketOf, resolvePeriod, zonedParts, type PeriodPreset } from "../time";
import { percentChange } from "@/lib/utils";

type OverviewPreset = Extract<PeriodPreset, "today" | "week" | "month">;

async function ordersBetween(ctx: ServiceContext, start: Date, end: Date) {
  return ctx.db.order.findMany({
    where: { createdAt: { gte: start, lt: end }, status: { not: "DRAFT" } },
    select: { id: true, createdAt: true, total: true, status: true, type: true, source: true, customerId: true, placedAt: true, readyAt: true },
  });
}

type Row = Awaited<ReturnType<typeof ordersBetween>>[number];

function summarize(rows: Row[]) {
  const completed = rows.filter((o) => o.status === "COMPLETED");
  const sales = completed.reduce((s, o) => s + o.total, 0);
  const orders = rows.filter((o) => o.status !== "CANCELLED").length;
  const customers = new Set(rows.filter((o) => o.customerId).map((o) => o.customerId)).size;
  const byType = { DINE_IN: 0, TAKEAWAY: 0, DELIVERY: 0, ONLINE: 0 } as Record<string, number>;
  for (const o of rows) if (o.status !== "CANCELLED") byType[o.type] = (byType[o.type] ?? 0) + 1;
  const online = rows.filter((o) => o.status !== "CANCELLED" && (o.type === "ONLINE" || ["WEBSITE", "SWIGGY", "ZOMATO"].includes(o.source))).length;
  const prep = rows.filter((o) => o.placedAt && o.readyAt).map((o) => (o.readyAt!.getTime() - o.placedAt!.getTime()) / 60_000);
  return {
    sales,
    orders,
    completed: completed.length,
    cancelled: rows.filter((o) => o.status === "CANCELLED").length,
    refunded: rows.filter((o) => o.status === "REFUNDED").length,
    customers,
    aov: completed.length ? Math.round(sales / completed.length) : 0,
    byType,
    online,
    avgPrepMinutes: prep.length ? prep.reduce((a, b) => a + b, 0) / prep.length : null,
  };
}

export async function getOverview(ctx: ServiceContext & { restaurant: { timezone: string } }, preset: OverviewPreset) {
  const tz = ctx.restaurant.timezone;
  const range = resolvePeriod(preset, tz);
  const trendRange = preset === "today" ? resolvePeriod("7d", tz) : range;

  const [cur, prev, trendCur, trendPrev, newCustomers, prevNewCustomers, openOrders] = await Promise.all([
    ordersBetween(ctx, range.start, range.end),
    ordersBetween(ctx, range.prevStart, range.prevEnd),
    preset === "today" ? ordersBetween(ctx, trendRange.start, trendRange.end) : Promise.resolve(null),
    preset === "today" ? ordersBetween(ctx, trendRange.prevStart, trendRange.prevEnd) : Promise.resolve(null),
    ctx.db.customer.count({ where: { createdAt: { gte: range.start, lt: range.end }, deletedAt: null } }),
    ctx.db.customer.count({ where: { createdAt: { gte: range.prevStart, lt: range.prevEnd }, deletedAt: null } }),
    ctx.db.order.findMany({
      where: { status: { in: ["NEW", "PREPARING", "READY", "SERVED"] } },
      select: { status: true, total: true, paidTotal: true, type: true, tableId: true },
    }),
  ]);

  const now = summarize(cur);
  const before = summarize(prev);
  const due = openOrders.reduce((s, o) => s + Math.max(0, o.total - o.paidTotal), 0);

  // Sales trend, previous period aligned by position.
  const tCur = trendCur ?? cur;
  const tPrev = trendPrev ?? prev;
  const tRange = preset === "today" ? trendRange : range;
  const fullRange = preset === "week" ? { ...tRange, end: new Date(tRange.start.getTime() + 7 * 86_400_000) } : preset === "month" ? { ...tRange, end: new Date(tRange.start.getTime() + 31 * 86_400_000) } : tRange;
  const allKeys = bucketKeys(fullRange, tz);
  const keys = preset === "month" ? allKeys.filter((k) => k.slice(0, 7) === allKeys[0]!.slice(0, 7)) : allKeys;
  const prevKeys = bucketKeys({ start: tRange.prevStart, end: new Date(tRange.prevStart.getTime() + keys.length * 86_400_000 + 3_600_000), bucket: tRange.bucket }, tz);
  const sumBy = (rows: Row[]) => {
    const m = new Map<string, number>();
    for (const o of rows) if (o.status === "COMPLETED") m.set(bucketOf(o.createdAt, tRange.bucket, tz), (m.get(bucketOf(o.createdAt, tRange.bucket, tz)) ?? 0) + o.total);
    return m;
  };
  const curMap = sumBy(tCur);
  const prevMap = sumBy(tPrev);
  const todayKey = zonedParts(new Date(), tz).ymd;
  const trend = keys.map((k, i) => ({
    label: preset === "week" ? new Date(`${k}T12:00:00Z`).toLocaleString("en-IN", { weekday: "short", timeZone: "UTC" }) : bucketLabel(k, tRange.bucket),
    current: k > todayKey ? null : (curMap.get(k) ?? 0),
    previous: prevMap.get(prevKeys[i] ?? "") ?? 0,
  }));

  // Revenue by hour of day (selected period).
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
  for (const o of cur) {
    if (o.status !== "COMPLETED") continue;
    const h = zonedParts(o.createdAt, tz).hour;
    hourly[h]!.revenue += o.total;
    hourly[h]!.orders += 1;
  }
  const peak = Math.max(...hourly.map((h) => h.revenue));
  const revenueByHour = hourly
    .filter((h) => h.hour >= 8 && h.hour <= 23)
    .map((h) => ({ label: bucketLabel(String(h.hour), "hour"), revenue: h.revenue, orders: h.orders, peak: h.revenue === peak && peak > 0 }));

  const completedIds = { status: "COMPLETED" as const, createdAt: { gte: range.start, lt: range.end } };
  const [topProducts, categories, payments] = await Promise.all([
    ctx.db.orderItem.groupBy({
      by: ["name"],
      where: { order: completedIds },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 6,
    }),
    ctx.db.orderItem.groupBy({
      by: ["categoryName"],
      where: { order: completedIds },
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: "desc" } },
    }),
    ctx.db.orderPayment.groupBy({
      by: ["method"],
      where: { kind: "PAYMENT", order: completedIds },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);

  const lowStock = hasPermission(ctx, "inventory.view")
    ? (await ctx.db.ingredient.findMany({ where: { isActive: true }, select: { id: true, name: true, currentStock: true, minStock: true, unit: true } }))
        .filter((i) => i.currentStock <= i.minStock)
        .sort((a, b) => a.currentStock / Math.max(a.minStock, 0.001) - b.currentStock / Math.max(b.minStock, 0.001))
        .slice(0, 6)
    : null;

  const recentOrders = await ctx.db.order.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: 7,
    select: {
      id: true, orderNumber: true, createdAt: true, total: true, status: true, paymentStatus: true, type: true,
      customerName: true, table: { select: { name: true } }, _count: { select: { items: true } },
    },
  });

  const reservations = hasPermission(ctx, "reservations.view")
    ? await ctx.db.reservation.findMany({
        where: { startsAt: { gte: new Date(Date.now() - 2 * 3_600_000) }, status: { in: ["PENDING", "CONFIRMED", "SEATED"] } },
        orderBy: { startsAt: "asc" },
        take: 6,
        select: { id: true, customerName: true, partySize: true, startsAt: true, status: true, table: { select: { name: true } } },
      })
    : null;

  return {
    range: { label: range.label, compareLabel: range.compareLabel },
    kpis: {
      sales: { value: now.sales, delta: percentChange(now.sales, before.sales) },
      orders: { value: now.orders, delta: percentChange(now.orders, before.orders), diff: now.orders - before.orders },
      customers: { value: now.customers, newCount: newCustomers, delta: percentChange(now.customers, before.customers), prevNew: prevNewCustomers },
      due: { value: due, openOrders: openOrders.length, openTables: new Set(openOrders.filter((o) => o.tableId).map((o) => o.tableId)).size },
    },
    metrics: {
      aov: { value: now.aov, delta: percentChange(now.aov, before.aov) },
      online: { value: now.online, delta: percentChange(now.online, before.online) },
      dineIn: { value: now.byType.DINE_IN ?? 0, delta: percentChange(now.byType.DINE_IN ?? 0, before.byType.DINE_IN ?? 0) },
      takeaway: { value: now.byType.TAKEAWAY ?? 0, delta: percentChange(now.byType.TAKEAWAY ?? 0, before.byType.TAKEAWAY ?? 0) },
      delivery: { value: now.byType.DELIVERY ?? 0, delta: percentChange(now.byType.DELIVERY ?? 0, before.byType.DELIVERY ?? 0) },
    },
    pipeline: {
      new: openOrders.filter((o) => o.status === "NEW").length,
      preparing: openOrders.filter((o) => o.status === "PREPARING").length,
      ready: openOrders.filter((o) => o.status === "READY").length,
      served: openOrders.filter((o) => o.status === "SERVED").length,
      completed: now.completed,
      cancelled: now.cancelled,
      refunded: now.refunded,
      avgPrepMinutes: now.avgPrepMinutes,
    },
    trend,
    trendLabels: preset === "today" ? { current: "Last 7 days", previous: "Previous 7 days" } : preset === "week" ? { current: "This week", previous: "Last week" } : { current: "This month", previous: "Last month" },
    revenueByHour,
    orderTypes: [
      { label: "Dine-in", value: now.byType.DINE_IN ?? 0 },
      { label: "Takeaway", value: now.byType.TAKEAWAY ?? 0 },
      { label: "Delivery", value: now.byType.DELIVERY ?? 0 },
      { label: "Online", value: now.byType.ONLINE ?? 0 },
    ],
    topProducts: topProducts.map((p) => ({ name: p.name, quantity: p._sum.quantity ?? 0, revenue: p._sum.lineTotal ?? 0 })),
    categories: categories.map((c) => ({ name: c.categoryName ?? "Uncategorised", revenue: c._sum.lineTotal ?? 0, quantity: c._sum.quantity ?? 0 })),
    payments: payments.map((p) => ({ method: p.method, amount: p._sum.amount ?? 0, count: p._count })),
    lowStock,
    recentOrders,
    reservations,
  };
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;

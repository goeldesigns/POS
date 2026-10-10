import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "../auth/load-context";
import { parseListParams, param, type SearchParams } from "../list-params";
import { resolvePeriod, type PeriodPreset } from "../time";

export const ORDER_TABS = ["ALL", "NEW", "PREPARING", "READY", "SERVED", "COMPLETED", "CANCELLED", "REFUNDED", "DRAFT"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

const SORTABLE = ["createdAt", "total", "number"] as const;

export function orderWhere(sp: SearchParams, tz: string): Prisma.OrderWhereInput {
  const q = (param(sp, "q") ?? "").trim();
  const where: Prisma.OrderWhereInput = {};
  const and: Prisma.OrderWhereInput[] = [];
  if (q) {
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { table: { name: { equals: q, mode: "insensitive" } } },
        { externalRef: { contains: q, mode: "insensitive" } },
        ...(digits ? [{ number: Number(digits) || -1 }, ...(digits.length >= 4 ? [{ customerPhone: { contains: digits } }] : [])] : []),
      ],
    });
  }
  const type = param(sp, "type");
  if (type && ["DINE_IN", "TAKEAWAY", "DELIVERY", "ONLINE"].includes(type)) and.push({ type: type as never });
  const source = param(sp, "source");
  if (source && ["POS", "WEBSITE", "SWIGGY", "ZOMATO", "ADMIN", "OTHER"].includes(source)) and.push({ source: source as never });
  const payment = param(sp, "payment");
  if (payment && ["UNPAID", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment)) and.push({ paymentStatus: payment as never });
  const staff = param(sp, "staff");
  if (staff) and.push({ createdById: staff });
  const period = param(sp, "period") as PeriodPreset | undefined;
  if (period && ["today", "yesterday", "7d", "30d", "90d"].includes(period)) {
    const r = resolvePeriod(period, tz);
    and.push({ createdAt: { gte: r.start, lt: period === "yesterday" ? r.end : new Date(Date.now() + 60_000) } });
  }
  if (and.length) where.AND = and;
  return where;
}

export async function listOrders(ctx: ServiceContext, sp: SearchParams, tz: string) {
  const tab = (ORDER_TABS as readonly string[]).includes(param(sp, "tab") ?? "") ? (param(sp, "tab") as OrderTab) : "ALL";
  const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: "createdAt" });
  const base = orderWhere(sp, tz);
  const where: Prisma.OrderWhereInput = tab === "ALL" ? { ...base, status: { not: "DRAFT" } } : { ...base, status: tab };

  const [rows, total, counts] = await Promise.all([
    ctx.db.order.findMany({
      where,
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
      select: {
        id: true, orderNumber: true, createdAt: true, customerName: true, customerPhone: true, type: true, source: true,
        total: true, paymentStatus: true, status: true, externalRef: true,
        table: { select: { name: true } },
        createdBy: { select: { name: true } },
        payments: { where: { kind: "PAYMENT" }, select: { method: true } },
        _count: { select: { items: true } },
      },
    }),
    ctx.db.order.count({ where }),
    ctx.db.order.groupBy({ by: ["status"], where: base, _count: true }),
  ]);

  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;
  const tabCounts: Record<OrderTab, number> = {
    ALL: Object.entries(countBy).filter(([s]) => s !== "DRAFT").reduce((a, [, n]) => a + n, 0),
    NEW: countBy.NEW ?? 0,
    PREPARING: countBy.PREPARING ?? 0,
    READY: countBy.READY ?? 0,
    SERVED: countBy.SERVED ?? 0,
    COMPLETED: countBy.COMPLETED ?? 0,
    CANCELLED: countBy.CANCELLED ?? 0,
    REFUNDED: countBy.REFUNDED ?? 0,
    DRAFT: countBy.DRAFT ?? 0,
  };

  return {
    tab,
    params: p,
    total,
    tabCounts,
    rows: rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      createdAt: r.createdAt.toISOString(),
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      tableName: r.table?.name ?? null,
      type: r.type,
      source: r.source,
      items: r._count.items,
      total: r.total,
      paymentStatus: r.paymentStatus,
      paymentMethods: [...new Set(r.payments.map((x) => x.method))],
      status: r.status,
      staff: r.createdBy?.name ?? null,
      externalRef: r.externalRef,
    })),
  };
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

/**
 * Tickets for the kitchen board. Deliberately carries no prices or payment details — the
 * kitchen only needs what to cook. Lines added after the ticket first went out are flagged,
 * and on a table that was already served the earlier lines are marked as served.
 */
export async function kitchenBoard(ctx: ServiceContext) {
  const orders = await ctx.db.order.findMany({
    where: { status: { in: ["NEW", "PREPARING", "READY"] } },
    orderBy: { placedAt: "asc" },
    take: 120,
    select: {
      id: true, orderNumber: true, status: true, type: true, source: true, placedAt: true, createdAt: true, servedAt: true, notes: true,
      guests: true, customerName: true,
      table: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, variantName: true, quantity: true, modifiers: true, notes: true, kitchenStation: true, createdAt: true },
      },
    },
  });
  return orders.map(({ servedAt, items, table, ...o }) => {
    const first = items[0]?.createdAt.getTime() ?? 0;
    return {
      ...o,
      placedAt: (o.placedAt ?? o.createdAt).toISOString(),
      createdAt: o.createdAt.toISOString(),
      tableName: table?.name ?? null,
      items: items.map(({ createdAt, modifiers, ...i }) => ({
        ...i,
        modifiers: ((modifiers as { name: string }[] | null) ?? []).map((m) => m.name),
        served: !!servedAt && createdAt <= servedAt,
        added: createdAt.getTime() > first && !(servedAt && createdAt <= servedAt),
      })),
    };
  });
}

export type KitchenOrder = Awaited<ReturnType<typeof kitchenBoard>>[number];

import type { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORY_LABEL, ORDER_SOURCE_LABEL, ORDER_STATUS, ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from "@/lib/labels";
import type { ModuleKey } from "@/lib/permissions/catalog";
import { convertQuantity } from "@/lib/units";
import type { ServiceContext } from "../auth/load-context";
import { NotFoundError } from "../errors";
import { param, type SearchParams } from "../list-params";
import { bucketKeys, bucketLabel, bucketOf, resolvePeriod, type PeriodPreset } from "../time";

export type ColumnKind = "text" | "money" | "number" | "percent" | "date" | "datetime" | "qty";

export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
}

export interface ReportResult {
  key: ReportKey;
  title: string;
  description: string;
  periodLabel: string;
  summary: { label: string; value: number; kind: ColumnKind; hint?: string }[];
  chart?: { type: "trend" | "bars" | "donut"; label: string; kind: "money" | "number"; data: { label: string; value: number }[] };
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
}

export type FilterKey = "period" | "type" | "payment" | "staff" | "table" | "category" | "product";

export const REPORT_DEFS = {
  sales: { title: "Sales report", description: "Daily gross, discounts, tax and net sales.", group: "Sales & orders", filters: ["period", "type", "staff"] },
  orders: { title: "Orders report", description: "Every order with type, source, staff and payment.", group: "Sales & orders", filters: ["period", "type", "payment", "staff", "table"] },
  payments: { title: "Payment report", description: "Collections by payment method, with refunds.", group: "Sales & orders", filters: ["period", "type"] },
  discounts: { title: "Discount report", description: "Manual discounts, coupons and loyalty redemptions.", group: "Sales & orders", filters: ["period", "staff"] },
  tax: { title: "Tax report", description: "Taxable value and GST (CGST/SGST) by day for filing.", group: "Sales & orders", filters: ["period"] },
  products: { title: "Product report", description: "Quantity and revenue for every menu item.", group: "Menu", filters: ["period", "category", "type"] },
  categories: { title: "Category report", description: "Revenue share by menu category.", group: "Menu", filters: ["period", "type"] },
  staff: { title: "Staff performance", description: "Orders, sales, discounts and voids by team member.", group: "Team & floor", filters: ["period"] },
  tables: { title: "Table performance", description: "Turns, covers, revenue and dwell time per table.", group: "Team & floor", filters: ["period"] },
  customers: { title: "Customer report", description: "Top guests, new vs returning and spend.", group: "Customers", filters: ["period"] },
  inventory: { title: "Inventory report", description: "Stock value, purchases, consumption and waste.", group: "Back office", filters: ["period", "category"], module: "inventory" },
  expenses: { title: "Expense report", description: "Operating expenses by category.", group: "Back office", filters: ["period"], module: "expenses" },
  pnl: { title: "Profit & loss", description: "Revenue, food cost, expenses and net profit.", group: "Back office", filters: ["period"], module: "expenses" },
} as const satisfies Record<string, { title: string; description: string; group: string; filters: FilterKey[]; module?: ModuleKey }>;

export type ReportKey = keyof typeof REPORT_DEFS;

export function isReportKey(k: string): k is ReportKey {
  return k in REPORT_DEFS;
}

export interface ReportFilters {
  preset: PeriodPreset;
  from?: string | null;
  to?: string | null;
  type?: string | null;
  payment?: string | null;
  staff?: string | null;
  table?: string | null;
  category?: string | null;
  product?: string | null;
}

export function filtersFrom(sp: SearchParams): ReportFilters {
  const preset = (["today", "yesterday", "7d", "30d", "90d", "12m", "custom"] as const).find((p) => p === param(sp, "period")) ?? "30d";
  return {
    preset,
    from: param(sp, "from"),
    to: param(sp, "to"),
    type: param(sp, "type"),
    payment: param(sp, "payment"),
    staff: param(sp, "staff"),
    table: param(sp, "table"),
    category: param(sp, "category"),
    product: param(sp, "product"),
  };
}

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

export async function runReport(ctx: ServiceContext & { restaurant: { timezone: string } }, key: ReportKey, f: ReportFilters): Promise<ReportResult> {
  const tz = ctx.restaurant.timezone;
  const range = resolvePeriod(f.preset, tz, { from: f.from, to: f.to });
  const def = REPORT_DEFS[key];
  const created = { gte: range.start, lt: range.end };
  const orderBase: Prisma.OrderWhereInput = {
    createdAt: created,
    ...(f.type ? { type: f.type as never } : {}),
    ...(f.staff ? { createdById: f.staff } : {}),
    ...(f.table ? { tableId: f.table } : {}),
  };
  const base = { key, title: def.title, description: def.description, periodLabel: range.label };

  switch (key) {
    case "sales": {
      const orders = await ctx.db.order.findMany({
        where: { ...orderBase, status: { in: ["COMPLETED", "REFUNDED"] } },
        select: { createdAt: true, subtotal: true, discountTotal: true, taxTotal: true, serviceCharge: true, total: true, refundedTotal: true },
      });
      const keys = bucketKeys(range, tz);
      const byDay = new Map(keys.map((k) => [k, { orders: 0, gross: 0, discounts: 0, tax: 0, service: 0, total: 0, refunds: 0 }]));
      for (const o of orders) {
        const b = byDay.get(bucketOf(o.createdAt, range.bucket, tz));
        if (!b) continue;
        b.orders++;
        b.gross += o.subtotal;
        b.discounts += o.discountTotal;
        b.tax += o.taxTotal;
        b.service += o.serviceCharge;
        b.total += o.total;
        b.refunds += o.refundedTotal;
      }
      const rows = keys.map((k) => {
        const b = byDay.get(k)!;
        return { period: bucketLabel(k, range.bucket), orders: b.orders, gross: b.gross, discounts: b.discounts, net: b.gross - b.discounts, tax: b.tax, service: b.service, refunds: b.refunds, total: b.total - b.refunds };
      });
      const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
      return {
        ...base,
        summary: [
          { label: "Net sales", value: sum("net"), kind: "money" },
          { label: "Orders", value: sum("orders"), kind: "number" },
          { label: "Average order", value: sum("orders") ? Math.round(sum("total") / sum("orders")) : 0, kind: "money" },
          { label: "Tax collected", value: sum("tax"), kind: "money" },
        ],
        chart: { type: "trend", label: "Total sales", kind: "money", data: rows.map((r) => ({ label: r.period, value: r.total })) },
        columns: [
          { key: "period", label: range.bucket === "hour" ? "Hour" : range.bucket === "month" ? "Month" : "Date", kind: "text" },
          { key: "orders", label: "Orders", kind: "number" },
          { key: "gross", label: "Gross sales", kind: "money" },
          { key: "discounts", label: "Discounts", kind: "money" },
          { key: "net", label: "Net sales", kind: "money" },
          { key: "tax", label: "Tax", kind: "money" },
          { key: "service", label: "Service charge", kind: "money" },
          { key: "refunds", label: "Refunds", kind: "money" },
          { key: "total", label: "Total collected", kind: "money" },
        ],
        rows,
        totals: { period: "Total", orders: sum("orders"), gross: sum("gross"), discounts: sum("discounts"), net: sum("net"), tax: sum("tax"), service: sum("service"), refunds: sum("refunds"), total: sum("total") },
      };
    }

    case "orders": {
      const where: Prisma.OrderWhereInput = { ...orderBase, status: { not: "DRAFT" }, ...(f.payment ? { payments: { some: { method: f.payment as never, kind: "PAYMENT" } } } : {}) };
      const orders = await ctx.db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
        include: { table: { select: { name: true } }, createdBy: { select: { name: true } }, payments: { where: { kind: "PAYMENT" }, select: { method: true } }, _count: { select: { items: true } } },
      });
      const done = orders.filter((o) => o.status === "COMPLETED");
      return {
        ...base,
        summary: [
          { label: "Orders", value: orders.length, kind: "number" },
          { label: "Completed", value: done.length, kind: "number" },
          { label: "Cancelled", value: orders.filter((o) => o.status === "CANCELLED").length, kind: "number" },
          { label: "Completed value", value: done.reduce((s, o) => s + o.total, 0), kind: "money" },
        ],
        columns: [
          { key: "order", label: "Order", kind: "text" },
          { key: "date", label: "Date", kind: "datetime" },
          { key: "type", label: "Type", kind: "text" },
          { key: "source", label: "Source", kind: "text" },
          { key: "table", label: "Table", kind: "text" },
          { key: "customer", label: "Customer", kind: "text" },
          { key: "staff", label: "Staff", kind: "text" },
          { key: "items", label: "Items", kind: "number" },
          { key: "total", label: "Amount", kind: "money" },
          { key: "payment", label: "Payment", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
        ],
        rows: orders.map((o) => ({
          order: o.orderNumber,
          date: o.createdAt.toISOString(),
          type: ORDER_TYPE_LABEL[o.type] ?? o.type,
          source: ORDER_SOURCE_LABEL[o.source] ?? o.source,
          table: o.table?.name ?? null,
          customer: o.customerName,
          staff: o.createdBy?.name ?? null,
          items: o._count.items,
          total: o.total,
          payment: `${PAYMENT_STATUS[o.paymentStatus]?.label ?? o.paymentStatus}${o.payments.length ? ` · ${[...new Set(o.payments.map((p) => PAYMENT_METHOD_LABEL[p.method]))].join(" + ")}` : ""}`,
          status: ORDER_STATUS[o.status]?.label ?? o.status,
        })),
      };
    }

    case "payments": {
      const payments = await ctx.db.orderPayment.findMany({
        where: { createdAt: created, ...(f.type ? { order: { type: f.type as never } } : {}) },
        select: { method: true, kind: true, amount: true },
      });
      const methods = new Map<string, { count: number; amount: number; refunds: number }>();
      for (const p of payments) {
        const m = methods.get(p.method) ?? { count: 0, amount: 0, refunds: 0 };
        if (p.kind === "PAYMENT") {
          m.count++;
          m.amount += p.amount;
        } else m.refunds += p.amount;
        methods.set(p.method, m);
      }
      const total = [...methods.values()].reduce((s, m) => s + m.amount, 0);
      const rows = [...methods.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([method, m]) => ({ method: PAYMENT_METHOD_LABEL[method] ?? method, count: m.count, amount: m.amount, share: pct(m.amount, total), refunds: m.refunds, net: m.amount - m.refunds }));
      return {
        ...base,
        summary: [
          { label: "Collected", value: total, kind: "money" },
          { label: "Transactions", value: rows.reduce((s, r) => s + r.count, 0), kind: "number" },
          { label: "Refunded", value: rows.reduce((s, r) => s + r.refunds, 0), kind: "money" },
          { label: "Net collections", value: rows.reduce((s, r) => s + r.net, 0), kind: "money" },
        ],
        chart: { type: "donut", label: "Amount", kind: "money", data: rows.map((r) => ({ label: r.method, value: r.amount })) },
        columns: [
          { key: "method", label: "Method", kind: "text" },
          { key: "count", label: "Transactions", kind: "number" },
          { key: "amount", label: "Collected", kind: "money" },
          { key: "share", label: "Share", kind: "percent" },
          { key: "refunds", label: "Refunds", kind: "money" },
          { key: "net", label: "Net", kind: "money" },
        ],
        rows,
      };
    }

    case "discounts": {
      const discounts = await ctx.db.orderDiscount.findMany({
        where: { order: { ...orderBase, status: { in: ["COMPLETED", "REFUNDED"] } } },
        select: { source: true, reason: true, couponCode: true, amount: true },
      });
      const groups = new Map<string, { source: string; label: string; count: number; amount: number }>();
      for (const d of discounts) {
        const label = d.source === "COUPON" ? `Coupon ${d.couponCode}` : d.source === "LOYALTY" ? "Loyalty points" : d.reason ?? "Manual discount";
        const k = `${d.source}|${label}`;
        const g = groups.get(k) ?? { source: d.source === "MANUAL" ? "Manual" : d.source === "COUPON" ? "Coupon" : "Loyalty", label, count: 0, amount: 0 };
        g.count++;
        g.amount += d.amount;
        groups.set(k, g);
      }
      const rows = [...groups.values()].sort((a, b) => b.amount - a.amount);
      const total = rows.reduce((s, r) => s + r.amount, 0);
      return {
        ...base,
        summary: [
          { label: "Total discounts", value: total, kind: "money" },
          { label: "Discounted orders", value: discounts.length, kind: "number" },
          { label: "Coupons", value: rows.filter((r) => r.source === "Coupon").reduce((s, r) => s + r.amount, 0), kind: "money" },
          { label: "Loyalty redemptions", value: rows.filter((r) => r.source === "Loyalty").reduce((s, r) => s + r.amount, 0), kind: "money" },
        ],
        chart: { type: "donut", label: "Discount", kind: "money", data: ["Manual", "Coupon", "Loyalty"].map((s) => ({ label: s, value: rows.filter((r) => r.source === s).reduce((a, r) => a + r.amount, 0) })).filter((d) => d.value > 0) },
        columns: [
          { key: "source", label: "Type", kind: "text" },
          { key: "label", label: "Reason / code", kind: "text" },
          { key: "count", label: "Times used", kind: "number" },
          { key: "amount", label: "Discount given", kind: "money" },
          { key: "share", label: "Share", kind: "percent" },
        ],
        rows: rows.map((r) => ({ ...r, share: pct(r.amount, total) })),
      };
    }

    case "tax": {
      const orders = await ctx.db.order.findMany({
        where: { createdAt: created, status: "COMPLETED" },
        select: { createdAt: true, taxes: { select: { name: true, rate: true, taxableAmount: true, amount: true } } },
      });
      const keys = bucketKeys(range, tz);
      const byDay = new Map(keys.map((k) => [k, { taxable: 0, tax: 0, invoices: 0 }]));
      const byRate = new Map<string, { taxable: number; tax: number }>();
      for (const o of orders) {
        const b = byDay.get(bucketOf(o.createdAt, range.bucket, tz));
        if (b) b.invoices++;
        for (const t of o.taxes) {
          if (b) {
            b.taxable += t.taxableAmount;
            b.tax += t.amount;
          }
          const r = byRate.get(t.name) ?? { taxable: 0, tax: 0 };
          r.taxable += t.taxableAmount;
          r.tax += t.amount;
          byRate.set(t.name, r);
        }
      }
      const rows = keys.map((k) => {
        const b = byDay.get(k)!;
        const cgst = Math.floor(b.tax / 2);
        return { period: bucketLabel(k, range.bucket), invoices: b.invoices, taxable: b.taxable, cgst, sgst: b.tax - cgst, tax: b.tax };
      });
      const sum = (k: "invoices" | "taxable" | "cgst" | "sgst" | "tax") => rows.reduce((s, r) => s + r[k], 0);
      return {
        ...base,
        summary: [
          { label: "Taxable value", value: sum("taxable"), kind: "money" },
          { label: "CGST", value: sum("cgst"), kind: "money" },
          { label: "SGST", value: sum("sgst"), kind: "money" },
          { label: "Total tax", value: sum("tax"), kind: "money", hint: [...byRate.entries()].map(([n, r]) => `${n}: ${(r.tax / 100).toFixed(2)}`).join(" · ") },
        ],
        columns: [
          { key: "period", label: "Date", kind: "text" },
          { key: "invoices", label: "Invoices", kind: "number" },
          { key: "taxable", label: "Taxable value", kind: "money" },
          { key: "cgst", label: "CGST", kind: "money" },
          { key: "sgst", label: "SGST", kind: "money" },
          { key: "tax", label: "Total tax", kind: "money" },
        ],
        rows,
        totals: { period: "Total", invoices: sum("invoices"), taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), tax: sum("tax") },
      };
    }

    case "products":
    case "categories": {
      const items = await ctx.db.orderItem.findMany({
        where: {
          order: { ...orderBase, status: "COMPLETED" },
          ...(f.category ? { product: { categoryId: f.category } } : {}),
          ...(f.product ? { productId: f.product } : {}),
        },
        select: { productId: true, name: true, categoryName: true, quantity: true, lineTotal: true, discount: true },
      });
      const groupKey = key === "products" ? (i: (typeof items)[number]) => i.productId ?? i.name : (i: (typeof items)[number]) => i.categoryName ?? "Uncategorised";
      const groups = new Map<string, { name: string; category: string; qty: number; revenue: number; orders: number }>();
      for (const i of items) {
        const k = groupKey(i);
        const g = groups.get(k) ?? { name: key === "products" ? i.name : (i.categoryName ?? "Uncategorised"), category: i.categoryName ?? "—", qty: 0, revenue: 0, orders: 0 };
        g.qty += i.quantity;
        g.revenue += i.lineTotal;
        g.orders++;
        groups.set(k, g);
      }
      const rows = [...groups.values()].sort((a, b) => b.revenue - a.revenue);
      const total = rows.reduce((s, r) => s + r.revenue, 0);
      const tableRows = rows.map((r) => ({ name: r.name, category: r.category, qty: r.qty, revenue: r.revenue, avg: r.qty ? Math.round(r.revenue / r.qty) : 0, share: pct(r.revenue, total) }));
      return {
        ...base,
        summary: [
          { label: "Item revenue", value: total, kind: "money" },
          { label: "Units sold", value: rows.reduce((s, r) => s + r.qty, 0), kind: "number" },
          { label: key === "products" ? "Items sold" : "Categories", value: rows.length, kind: "number" },
          { label: key === "products" ? "Top item share" : "Top category share", value: rows[0] ? pct(rows[0].revenue, total) : 0, kind: "percent", hint: rows[0]?.name },
        ],
        chart:
          key === "products"
            ? { type: "bars", label: "Revenue", kind: "money", data: rows.slice(0, 10).map((r) => ({ label: r.name, value: r.revenue })) }
            : { type: "donut", label: "Revenue", kind: "money", data: rows.map((r) => ({ label: r.name, value: r.revenue })) },
        columns:
          key === "products"
            ? [
                { key: "name", label: "Item", kind: "text" },
                { key: "category", label: "Category", kind: "text" },
                { key: "qty", label: "Qty sold", kind: "number" },
                { key: "revenue", label: "Revenue", kind: "money" },
                { key: "avg", label: "Avg. price", kind: "money" },
                { key: "share", label: "Share", kind: "percent" },
              ]
            : [
                { key: "name", label: "Category", kind: "text" },
                { key: "qty", label: "Units sold", kind: "number" },
                { key: "revenue", label: "Revenue", kind: "money" },
                { key: "avg", label: "Avg. unit price", kind: "money" },
                { key: "share", label: "Share", kind: "percent" },
              ],
        rows: tableRows,
        totals: { name: "Total", qty: rows.reduce((s, r) => s + r.qty, 0), revenue: total, share: 100 },
      };
    }

    case "staff": {
      const orders = await ctx.db.order.findMany({
        where: { createdAt: created, status: { not: "DRAFT" } },
        select: { createdById: true, status: true, total: true, discountTotal: true, refundedTotal: true, createdBy: { select: { name: true } } },
      });
      const staff = new Map<string, { name: string; orders: number; sales: number; discounts: number; cancelled: number; refunds: number }>();
      for (const o of orders) {
        const k = o.createdById ?? "system";
        const s = staff.get(k) ?? { name: o.createdBy?.name ?? "Online / system", orders: 0, sales: 0, discounts: 0, cancelled: 0, refunds: 0 };
        if (o.status === "CANCELLED") s.cancelled++;
        else {
          s.orders++;
          if (o.status === "COMPLETED") s.sales += o.total;
          s.discounts += o.discountTotal;
          s.refunds += o.refundedTotal;
        }
        staff.set(k, s);
      }
      const rows = [...staff.values()].sort((a, b) => b.sales - a.sales).map((s) => ({ ...s, aov: s.orders ? Math.round(s.sales / s.orders) : 0, discountRate: pct(s.discounts, s.sales + s.discounts) }));
      return {
        ...base,
        summary: [
          { label: "Team members active", value: rows.length, kind: "number" },
          { label: "Top seller", value: rows[0]?.sales ?? 0, kind: "money", hint: rows[0]?.name },
          { label: "Discounts given", value: rows.reduce((s, r) => s + r.discounts, 0), kind: "money" },
          { label: "Cancellations", value: rows.reduce((s, r) => s + r.cancelled, 0), kind: "number" },
        ],
        chart: { type: "bars", label: "Sales", kind: "money", data: rows.slice(0, 10).map((r) => ({ label: r.name, value: r.sales })) },
        columns: [
          { key: "name", label: "Staff", kind: "text" },
          { key: "orders", label: "Orders", kind: "number" },
          { key: "sales", label: "Sales", kind: "money" },
          { key: "aov", label: "Avg. order", kind: "money" },
          { key: "discounts", label: "Discounts", kind: "money" },
          { key: "discountRate", label: "Discount rate", kind: "percent" },
          { key: "cancelled", label: "Cancelled", kind: "number" },
          { key: "refunds", label: "Refunds", kind: "money" },
        ],
        rows,
      };
    }

    case "tables": {
      const orders = await ctx.db.order.findMany({
        where: { createdAt: created, status: "COMPLETED", tableId: { not: null } },
        select: { tableId: true, total: true, guests: true, placedAt: true, completedAt: true, table: { select: { name: true, capacity: true, floor: { select: { name: true } } } } },
      });
      const tables = new Map<string, { name: string; section: string; capacity: number; turns: number; covers: number; revenue: number; minutes: number[] }>();
      for (const o of orders) {
        if (!o.table) continue;
        const t = tables.get(o.tableId!) ?? { name: o.table.name, section: o.table.floor.name, capacity: o.table.capacity, turns: 0, covers: 0, revenue: 0, minutes: [] };
        t.turns++;
        t.covers += o.guests ?? 0;
        t.revenue += o.total;
        if (o.placedAt && o.completedAt) t.minutes.push((o.completedAt.getTime() - o.placedAt.getTime()) / 60_000);
        tables.set(o.tableId!, t);
      }
      const rows = [...tables.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .map((t) => ({
          name: t.name,
          section: t.section,
          capacity: t.capacity,
          turns: t.turns,
          covers: t.covers,
          revenue: t.revenue,
          avgCheck: t.turns ? Math.round(t.revenue / t.turns) : 0,
          perCover: t.covers ? Math.round(t.revenue / t.covers) : 0,
          dwell: t.minutes.length ? Math.round(t.minutes.reduce((a, b) => a + b, 0) / t.minutes.length) : 0,
        }));
      return {
        ...base,
        summary: [
          { label: "Dine-in revenue", value: rows.reduce((s, r) => s + r.revenue, 0), kind: "money" },
          { label: "Covers served", value: rows.reduce((s, r) => s + r.covers, 0), kind: "number" },
          { label: "Table turns", value: rows.reduce((s, r) => s + r.turns, 0), kind: "number" },
          { label: "Avg. dwell time (min)", value: rows.length ? Math.round(rows.reduce((s, r) => s + r.dwell, 0) / rows.length) : 0, kind: "number" },
        ],
        chart: { type: "bars", label: "Revenue", kind: "money", data: rows.slice(0, 12).map((r) => ({ label: r.name, value: r.revenue })) },
        columns: [
          { key: "name", label: "Table", kind: "text" },
          { key: "section", label: "Section", kind: "text" },
          { key: "capacity", label: "Seats", kind: "number" },
          { key: "turns", label: "Turns", kind: "number" },
          { key: "covers", label: "Covers", kind: "number" },
          { key: "revenue", label: "Revenue", kind: "money" },
          { key: "avgCheck", label: "Avg. check", kind: "money" },
          { key: "perCover", label: "Per cover", kind: "money" },
          { key: "dwell", label: "Avg. dwell (min)", kind: "number" },
        ],
        rows,
      };
    }

    case "customers": {
      const orders = await ctx.db.order.findMany({
        where: { createdAt: created, status: "COMPLETED", customerId: { not: null } },
        select: { customerId: true, total: true, createdAt: true, customer: { select: { name: true, phone: true, createdAt: true, totalOrders: true } } },
      });
      const guests = new Map<string, { name: string; phone: string; orders: number; spend: number; last: Date; isNew: boolean; lifetime: number }>();
      for (const o of orders) {
        if (!o.customer) continue;
        const g = guests.get(o.customerId!) ?? { name: o.customer.name, phone: o.customer.phone, orders: 0, spend: 0, last: o.createdAt, isNew: o.customer.createdAt >= range.start, lifetime: o.customer.totalOrders };
        g.orders++;
        g.spend += o.total;
        if (o.createdAt > g.last) g.last = o.createdAt;
        guests.set(o.customerId!, g);
      }
      const rows = [...guests.values()].sort((a, b) => b.spend - a.spend);
      const newCount = rows.filter((r) => r.isNew).length;
      return {
        ...base,
        summary: [
          { label: "Guests identified", value: rows.length, kind: "number" },
          { label: "New guests", value: newCount, kind: "number" },
          { label: "Returning guests", value: rows.length - newCount, kind: "number" },
          { label: "Spend by known guests", value: rows.reduce((s, r) => s + r.spend, 0), kind: "money" },
        ],
        chart: { type: "donut", label: "Guests", kind: "number", data: [{ label: "Returning", value: rows.length - newCount }, { label: "New", value: newCount }] },
        columns: [
          { key: "name", label: "Customer", kind: "text" },
          { key: "phone", label: "Phone", kind: "text" },
          { key: "orders", label: "Orders (period)", kind: "number" },
          { key: "spend", label: "Spend (period)", kind: "money" },
          { key: "lifetime", label: "Lifetime orders", kind: "number" },
          { key: "last", label: "Last visit", kind: "date" },
          { key: "kind", label: "Type", kind: "text" },
        ],
        rows: rows.map((r) => ({ name: r.name, phone: r.phone, orders: r.orders, spend: r.spend, lifetime: r.lifetime, last: r.last.toISOString(), kind: r.isNew ? "New" : "Returning" })),
      };
    }

    case "inventory": {
      const [ingredients, txns] = await Promise.all([
        ctx.db.ingredient.findMany({ where: { isActive: true, ...(f.category ? { category: f.category } : {}) }, orderBy: { name: "asc" } }),
        ctx.db.stockTransaction.groupBy({ by: ["ingredientId", "type"], where: { createdAt: created }, _sum: { quantity: true } }),
      ]);
      const sumOf = (id: string, types: string[]) => txns.filter((t) => t.ingredientId === id && types.includes(t.type)).reduce((s, t) => s + (t._sum.quantity ?? 0), 0);
      const rows = ingredients.map((i) => {
        const used = -sumOf(i.id, ["SALE"]);
        const wasted = -sumOf(i.id, ["WASTE"]);
        return {
          name: i.name,
          sku: i.sku,
          category: i.category,
          unit: i.unit.toLowerCase(),
          stock: Math.round(i.currentStock * 1000) / 1000,
          value: Math.round(Math.max(0, i.currentStock) * i.costPerUnit),
          purchased: Math.round(sumOf(i.id, ["PURCHASE"]) * 1000) / 1000,
          used: Math.round(used * 1000) / 1000,
          usedValue: Math.round(used * i.costPerUnit),
          wasted: Math.round(wasted * 1000) / 1000,
          wasteValue: Math.round(wasted * i.costPerUnit),
          status: i.currentStock <= 0 ? "Out of stock" : i.currentStock <= i.minStock ? "Low" : "OK",
        };
      });
      return {
        ...base,
        summary: [
          { label: "Stock value", value: rows.reduce((s, r) => s + r.value, 0), kind: "money" },
          { label: "Consumed (cost)", value: rows.reduce((s, r) => s + r.usedValue, 0), kind: "money" },
          { label: "Waste (cost)", value: rows.reduce((s, r) => s + r.wasteValue, 0), kind: "money" },
          { label: "Low / out of stock", value: rows.filter((r) => r.status !== "OK").length, kind: "number" },
        ],
        chart: { type: "bars", label: "Consumed", kind: "money", data: [...rows].sort((a, b) => b.usedValue - a.usedValue).slice(0, 10).map((r) => ({ label: r.name, value: r.usedValue })) },
        columns: [
          { key: "name", label: "Ingredient", kind: "text" },
          { key: "sku", label: "SKU", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "stock", label: "In stock", kind: "qty" },
          { key: "value", label: "Stock value", kind: "money" },
          { key: "purchased", label: "Purchased", kind: "qty" },
          { key: "used", label: "Consumed", kind: "qty" },
          { key: "usedValue", label: "Consumed cost", kind: "money" },
          { key: "wasted", label: "Wasted", kind: "qty" },
          { key: "status", label: "Status", kind: "text" },
        ],
        rows,
      };
    }

    case "expenses": {
      const expenses = await ctx.db.expense.findMany({ where: { date: created }, orderBy: { date: "desc" } });
      const byCat = new Map<string, number>();
      for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
      const total = expenses.reduce((s, e) => s + e.amount, 0);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        ...base,
        summary: [
          { label: "Total expenses", value: total, kind: "money" },
          { label: "Entries", value: expenses.length, kind: "number" },
          { label: "Largest category", value: top?.[1] ?? 0, kind: "money", hint: top ? EXPENSE_CATEGORY_LABEL[top[0]] : undefined },
          { label: "Daily average", value: Math.round(total / Math.max(1, range.days)), kind: "money" },
        ],
        chart: { type: "donut", label: "Amount", kind: "money", data: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: EXPENSE_CATEGORY_LABEL[k] ?? k, value: v })) },
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "title", label: "Expense", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "vendor", label: "Vendor", kind: "text" },
          { key: "method", label: "Paid via", kind: "text" },
          { key: "amount", label: "Amount", kind: "money" },
        ],
        rows: expenses.map((e) => ({ date: e.date.toISOString(), title: e.title, category: EXPENSE_CATEGORY_LABEL[e.category] ?? e.category, vendor: e.vendor, method: PAYMENT_METHOD_LABEL[e.paymentMethod], amount: e.amount })),
        totals: { title: "Total", amount: total },
      };
    }

    case "pnl": {
      const [orders, expenses, items] = await Promise.all([
        ctx.db.order.aggregate({ where: { createdAt: created, status: { in: ["COMPLETED", "REFUNDED"] } }, _sum: { subtotal: true, discountTotal: true, taxTotal: true, serviceCharge: true, refundedTotal: true } }),
        ctx.db.expense.groupBy({ by: ["category"], where: { date: created }, _sum: { amount: true } }),
        ctx.db.orderItem.groupBy({ by: ["productId"], where: { order: { createdAt: created, status: "COMPLETED" } }, _sum: { quantity: true } }),
      ]);
      // Food cost: recipe cost at current ingredient prices × units sold (falls back to item cost price).
      const productIds = items.map((i) => i.productId).filter((x): x is string => !!x);
      const products = await ctx.db.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true, costPrice: true,
          recipe: { select: { yieldQuantity: true, wastePercent: true, ingredients: { select: { quantity: true, unit: true, wastePercent: true, ingredient: { select: { unit: true, costPerUnit: true } } } } } },
          comboItems: { select: { quantity: true, product: { select: { costPrice: true, recipe: { select: { yieldQuantity: true, wastePercent: true, ingredients: { select: { quantity: true, unit: true, wastePercent: true, ingredient: { select: { unit: true, costPerUnit: true } } } } } } } } } },
        },
      });
      type R = NonNullable<(typeof products)[number]["recipe"]>;
      const recipeCost = (r: R | null, fallback: number | null) =>
        r
          ? r.ingredients.reduce((s, l) => s + convertQuantity(l.quantity, l.unit, l.ingredient.unit) * l.ingredient.costPerUnit * (1 + (r.wastePercent + l.wastePercent) / 100), 0) / Math.max(1, r.yieldQuantity)
          : (fallback ?? 0);
      const unitCost = new Map(
        products.map((p) => [p.id, p.comboItems.length ? p.comboItems.reduce((s, c) => s + c.quantity * recipeCost(c.product.recipe, c.product.costPrice), 0) : recipeCost(p.recipe, p.costPrice)]),
      );
      const cogs = Math.round(items.reduce((s, i) => s + (i._sum.quantity ?? 0) * (unitCost.get(i.productId ?? "") ?? 0), 0));
      const s = orders._sum;
      const netSales = (s.subtotal ?? 0) - (s.discountTotal ?? 0) - (s.refundedTotal ?? 0) + (s.serviceCharge ?? 0);
      const opex = expenses.filter((e) => e.category !== "RAW_MATERIALS");
      const rawPurchases = expenses.find((e) => e.category === "RAW_MATERIALS")?._sum.amount ?? 0;
      const opexTotal = opex.reduce((a, e) => a + (e._sum.amount ?? 0), 0);
      const gross = netSales - cogs;
      const net = gross - opexTotal;
      const rows: Record<string, string | number | null>[] = [
        { line: "Net sales (excl. tax, after discounts & refunds)", amount: netSales, share: 100 },
        { line: "Food cost (recipe cost of items sold)", amount: -cogs, share: -pct(cogs, netSales) },
        { line: "Gross profit", amount: gross, share: pct(gross, netSales) },
        ...opex.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)).map((e) => ({ line: `  ${EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}`, amount: -(e._sum.amount ?? 0), share: -pct(e._sum.amount ?? 0, netSales) })),
        { line: "Total operating expenses", amount: -opexTotal, share: -pct(opexTotal, netSales) },
        { line: "Net profit", amount: net, share: pct(net, netSales) },
      ];
      return {
        ...base,
        summary: [
          { label: "Net sales", value: netSales, kind: "money" },
          { label: "Food cost %", value: pct(cogs, netSales), kind: "percent", hint: `Raw material purchases: ${formatMoney(rawPurchases, { decimals: 0 })}` },
          { label: "Operating expenses", value: opexTotal, kind: "money" },
          { label: "Net profit", value: net, kind: "money", hint: `${pct(net, netSales).toFixed(1)}% margin` },
        ],
        columns: [
          { key: "line", label: "Line item", kind: "text" },
          { key: "amount", label: "Amount", kind: "money" },
          { key: "share", label: "% of sales", kind: "percent" },
        ],
        rows,
      };
    }
  }
  throw new NotFoundError("Report");
}

/** Options for report filter dropdowns. */
export async function reportFilterOptions(ctx: ServiceContext) {
  const [staff, tables, categories, ingredientCats] = await Promise.all([
    ctx.db.restaurantUser.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ctx.db.diningTable.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    ctx.db.ingredient.findMany({ distinct: ["category"], select: { category: true } }),
  ]);
  return {
    staff: staff.map((s) => ({ value: s.user.id, label: s.user.name })),
    tables: tables.map((t) => ({ value: t.id, label: t.name })),
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    ingredientCategories: ingredientCats.map((c) => ({ value: c.category, label: c.category })),
  };
}

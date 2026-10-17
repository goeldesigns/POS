import type { ModuleKey } from "@/lib/permissions/catalog";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";
import { param, type SearchParams } from "../list-params";
import type { PeriodPreset } from "../time";

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

function reportQuery(f: ReportFilters) {
  return { period: f.preset, from: f.from, to: f.to, type: f.type, payment: f.payment, staff: f.staff, table: f.table, category: f.category, product: f.product };
}

export async function runReport(_ctx: ServiceContext & { restaurant: { timezone: string } }, key: ReportKey, f: ReportFilters): Promise<ReportResult> {
  return backend.get<ReportResult>(`/api/v1/reports/${key}`, reportQuery(f));
}

export async function reportFilterOptions(_ctx: ServiceContext) {
  const data = await backend.get<{
    filterOptions: {
      staff: { value: string; label: string }[];
      tables: { value: string; label: string }[];
      categories: { value: string; label: string }[];
      ingredientCategories: { value: string; label: string }[];
    };
  }>("/api/v1/reports");
  return data.filterOptions;
}

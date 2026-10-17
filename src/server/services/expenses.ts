import type { ExpenseCategory, PaymentMethod } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, type SearchParams } from "../list-params";

interface ExpenseRowWire {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  vendor: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
}

interface ExpenseListWire {
  rows: ExpenseRowWire[];
  total: number;
  periodLabel: string;
  stats: { range: number; month: number; week: number; top: { label: string; amount: number } | null };
  trend: { label: string; amount: number; current: boolean }[];
  byCategory: { label: string; amount: number }[];
}

export async function listExpenses(_ctx: ServiceContext & { restaurant: { timezone: string } }, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["date", "amount"] as const, defaultSort: "date" });
  const data = await backend.get<ExpenseListWire>("/api/v1/expenses", pick(sp, "q", "period", "category", "method", "page", "pageSize", "sort", "dir"));
  return {
    params: p,
    total: data.total,
    periodLabel: data.periodLabel,
    stats: {
      range: data.stats.range,
      month: data.stats.month,
      week: data.stats.week,
      top: data.stats.top ? { label: data.stats.top.label, amount: data.stats.top.amount } : null,
    },
    trend: data.trend.map((t) => ({ label: t.label, amount: t.amount, current: t.current })),
    byCategory: data.byCategory.map((c) => ({ label: c.label, value: c.amount })),
    rows: data.rows,
  };
}

export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>["rows"][number];

export interface ExpenseInput {
  id?: string;
  title: string;
  category: ExpenseRow["category"];
  amount: number;
  date: Date;
  paymentMethod: ExpenseRow["paymentMethod"];
  vendor: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
}

export async function saveExpense(_ctx: ServiceContext, input: ExpenseInput) {
  const { id, ...rest } = input;
  const body = { ...rest, date: input.date.toISOString().slice(0, 10) };
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/expenses/${id}`, body) : await backend.post<{ id: string }>("/api/v1/expenses", body);
  return saved.id;
}

export async function deleteExpense(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/expenses/${id}`);
}

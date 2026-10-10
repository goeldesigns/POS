import type { Prisma } from "@/generated/prisma/client";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/labels";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { formatMoney } from "@/lib/format";
import { NotFoundError } from "../errors";
import { parseListParams, param, type SearchParams } from "../list-params";
import { resolvePeriod, zonedParts, type PeriodPreset } from "../time";

export async function listExpenses(ctx: ServiceContext & { restaurant: { timezone: string } }, sp: SearchParams) {
  const tz = ctx.restaurant.timezone;
  const p = parseListParams(sp, { sortable: ["date", "amount"] as const, defaultSort: "date" });
  const preset = (["7d", "30d", "90d", "12m", "month"] as const).find((x) => x === param(sp, "period")) ?? "30d";
  const range = resolvePeriod(preset as PeriodPreset, tz);
  const where: Prisma.ExpenseWhereInput = { date: { gte: range.start, lt: new Date(Date.now() + 86_400_000) } };
  const and: Prisma.ExpenseWhereInput[] = [];
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { vendor: { contains: p.q, mode: "insensitive" } }, { notes: { contains: p.q, mode: "insensitive" } }] });
  const category = param(sp, "category");
  if (category) and.push({ category: category as never });
  const method = param(sp, "method");
  if (method) and.push({ paymentMethod: method as never });
  if (and.length) where.AND = and;

  const month = resolvePeriod("month", tz);
  const week = resolvePeriod("week", tz);
  const sixMonthsAgo = new Date(Date.now() - 186 * 86_400_000);

  const [rows, total, sumRange, byCategory, sumMonth, sumWeek, trendRows] = await Promise.all([
    ctx.db.expense.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.pageSize }),
    ctx.db.expense.count({ where }),
    ctx.db.expense.aggregate({ where, _sum: { amount: true } }),
    ctx.db.expense.groupBy({ by: ["category"], where, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } } }),
    ctx.db.expense.aggregate({ where: { date: { gte: month.start } }, _sum: { amount: true } }),
    ctx.db.expense.aggregate({ where: { date: { gte: week.start } }, _sum: { amount: true } }),
    ctx.db.expense.findMany({ where: { date: { gte: sixMonthsAgo } }, select: { date: true, amount: true } }),
  ]);

  const months = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.set(d.toISOString().slice(0, 7), 0);
  }
  for (const e of trendRows) {
    const k = zonedParts(e.date, tz).ym;
    if (months.has(k)) months.set(k, months.get(k)! + e.amount);
  }
  const currentMonthKey = zonedParts(new Date(), tz).ym;

  return {
    params: p,
    total,
    periodLabel: range.label,
    stats: {
      range: sumRange._sum.amount ?? 0,
      month: sumMonth._sum.amount ?? 0,
      week: sumWeek._sum.amount ?? 0,
      top: byCategory[0] ? { label: EXPENSE_CATEGORY_LABEL[byCategory[0].category] ?? byCategory[0].category, amount: byCategory[0]._sum.amount ?? 0 } : null,
    },
    trend: [...months.entries()].map(([k, v]) => ({
      label: new Date(`${k}-15T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      amount: v,
      current: k === currentMonthKey,
    })),
    byCategory: byCategory.map((c) => ({ label: EXPENSE_CATEGORY_LABEL[c.category] ?? c.category, value: c._sum.amount ?? 0 })),
    rows: rows.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      amount: e.amount,
      date: e.date.toISOString(),
      paymentMethod: e.paymentMethod,
      vendor: e.vendor,
      notes: e.notes,
      attachmentUrl: e.attachmentUrl,
      attachmentName: e.attachmentName,
    })),
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

export async function saveExpense(ctx: ServiceContext, input: ExpenseInput) {
  assertPermission(ctx, input.id ? "expenses.edit" : "expenses.create");
  if (input.attachmentUrl && !input.attachmentUrl.startsWith(`/api/v1/files/${ctx.restaurantId}/`)) input.attachmentUrl = null;
  const { id, ...data } = input;
  if (id) {
    const e = await ctx.db.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundError("Expense");
    await ctx.db.expense.update({ where: { id }, data });
    await audit(ctx, { action: "expense.updated", entity: "Expense", entityId: id, summary: `${ctx.actor.name} updated expense ${input.title}` });
    return id;
  }
  const e = await ctx.db.expense.create({ data: { ...data, restaurantId: ctx.restaurantId, createdById: ctx.actor.userId } });
  await audit(ctx, { action: "expense.created", entity: "Expense", entityId: e.id, summary: `${ctx.actor.name} recorded ${input.title} (${formatMoney(input.amount)})` });
  return e.id;
}

export async function deleteExpense(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "expenses.delete");
  const e = await ctx.db.expense.findUnique({ where: { id } });
  if (!e) throw new NotFoundError("Expense");
  await ctx.db.expense.delete({ where: { id } });
  await audit(ctx, { action: "expense.deleted", entity: "Expense", entityId: id, summary: `${ctx.actor.name} deleted expense ${e.title} (${formatMoney(e.amount)})` });
}

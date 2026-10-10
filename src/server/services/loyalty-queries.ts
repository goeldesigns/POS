import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "../auth/load-context";
import { parseListParams, param, type SearchParams } from "../list-params";
import { getProgram } from "./loyalty";

export async function loyaltyOverview(ctx: ServiceContext, sp: SearchParams) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const p = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 20 });
  const type = param(sp, "type");
  const q = (param(sp, "q") ?? "").trim();
  const txnWhere: Prisma.LoyaltyTransactionWhereInput = {
    ...(type ? { type: type as never } : {}),
    ...(q ? { customer: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } } : {}),
  };
  const [program, accounts, earnedMonth, redeemedMonth, txns, txnTotal, top] = await Promise.all([
    getProgram(ctx.db, ctx),
    ctx.db.loyaltyAccount.aggregate({ _count: true, _sum: { balance: true, lifetimeEarned: true, lifetimeRedeemed: true } }),
    ctx.db.loyaltyTransaction.aggregate({ where: { type: { in: ["EARN", "BONUS"] }, createdAt: { gte: monthStart } }, _sum: { points: true } }),
    ctx.db.loyaltyTransaction.aggregate({ where: { type: "REDEEM", createdAt: { gte: monthStart } }, _sum: { points: true } }),
    ctx.db.loyaltyTransaction.findMany({ where: txnWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: p.skip, take: p.pageSize, include: { customer: { select: { id: true, name: true } }, order: { select: { id: true, orderNumber: true } } } }),
    ctx.db.loyaltyTransaction.count({ where: txnWhere }),
    ctx.db.loyaltyAccount.findMany({ orderBy: { balance: "desc" }, take: 10, include: { customer: { select: { id: true, name: true, phone: true, totalOrders: true, lastVisitAt: true } } } }),
  ]);
  const outstanding = accounts._sum.balance ?? 0;
  return {
    program,
    params: p,
    stats: {
      members: accounts._count,
      outstanding,
      liability: outstanding * program.pointValue,
      earnedMonth: earnedMonth._sum.points ?? 0,
      redeemedMonth: Math.abs(redeemedMonth._sum.points ?? 0),
      redemptionRate: accounts._sum.lifetimeEarned ? ((accounts._sum.lifetimeRedeemed ?? 0) / accounts._sum.lifetimeEarned) * 100 : 0,
    },
    top: top.map((a) => ({ id: a.customer.id, name: a.customer.name, phone: a.customer.phone, balance: a.balance, lifetimeEarned: a.lifetimeEarned, orders: a.customer.totalOrders, lastVisitAt: a.customer.lastVisitAt?.toISOString() ?? null })),
    total: txnTotal,
    txns: txns.map((t) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      customer: t.customer,
      type: t.type,
      points: t.points,
      balanceAfter: t.balanceAfter,
      description: t.description,
      order: t.order,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      actorName: t.actorName,
    })),
  };
}

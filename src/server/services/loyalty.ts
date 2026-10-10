import { loyaltyPointsFor } from "@/lib/pricing";
import type { TenantTx } from "../tenant-db";
import type { ServiceContext } from "../auth/load-context";
import { audit } from "../audit";
import { assertPermission } from "../auth/guards-core";
import { BusinessRuleError, NotFoundError } from "../errors";

export async function getProgram(tx: TenantTx, ctx: ServiceContext) {
  return tx.loyaltyProgram.upsert({
    where: { restaurantId: ctx.restaurantId },
    create: { restaurantId: ctx.restaurantId },
    update: {},
  });
}

type Program = Awaited<ReturnType<typeof getProgram>>;

function expiryFrom(program: Program, from = new Date()): Date | null {
  return program.expiryDays ? new Date(from.getTime() + program.expiryDays * 86_400_000) : null;
}

/** Fetch or open a loyalty account; new accounts receive the signup bonus. */
export async function ensureAccountTx(tx: TenantTx, ctx: ServiceContext, customerId: string, program?: Program) {
  const existing = await tx.loyaltyAccount.findUnique({ where: { customerId } });
  if (existing) return existing;
  const p = program ?? (await getProgram(tx, ctx));
  const bonus = p.isEnabled ? p.signupBonus : 0;
  const account = await tx.loyaltyAccount.create({
    data: {
      restaurantId: ctx.restaurantId,
      customerId,
      balance: bonus,
      lifetimeEarned: bonus,
    },
  });
  if (bonus > 0) {
    await tx.loyaltyTransaction.create({
      data: {
        restaurantId: ctx.restaurantId,
        accountId: account.id,
        customerId,
        type: "BONUS",
        points: bonus,
        balanceAfter: bonus,
        description: "Welcome bonus",
        expiresAt: expiryFrom(p),
        actorName: ctx.actor.name,
      },
    });
  }
  return account;
}

/**
 * Lifetime counters move with the ledger so that, apart from manual
 * adjustments, balance = earned − redeemed − expired. Reversals undo the
 * counter of the movement they reverse: a refund that takes back earned
 * points lowers "earned"; one that returns redeemed points lowers "redeemed".
 */
function lifetimeChange(type: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE" | "BONUS" | "REVERSAL", delta: number, reverses?: "EARN" | "REDEEM") {
  switch (type) {
    case "EARN":
    case "BONUS":
      return { lifetimeEarned: { increment: delta } };
    case "REDEEM":
      return { lifetimeRedeemed: { increment: -delta } };
    case "EXPIRE":
      return { lifetimeExpired: { increment: -delta } };
    case "REVERSAL":
      if (reverses === "EARN") return { lifetimeEarned: { increment: delta } };
      if (reverses === "REDEEM") return { lifetimeRedeemed: { increment: -delta } };
      throw new Error("A loyalty reversal must say which movement it reverses");
    default:
      return {};
  }
}

async function post(
  tx: TenantTx,
  ctx: ServiceContext,
  opts: {
    accountId: string;
    customerId: string;
    type: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE" | "BONUS" | "REVERSAL";
    points: number;
    description: string;
    orderId?: string | null;
    expiresAt?: Date | null;
    /** For REVERSAL: which earlier movement is being undone. */
    reverses?: "EARN" | "REDEEM";
  },
) {
  const delta = opts.points;
  const account = await tx.loyaltyAccount.update({
    where: { id: opts.accountId },
    data: { balance: { increment: delta }, ...lifetimeChange(opts.type, delta, opts.reverses) },
  });
  if (account.balance < 0) throw new BusinessRuleError("Not enough loyalty points");
  await tx.loyaltyTransaction.create({
    data: {
      restaurantId: ctx.restaurantId,
      accountId: account.id,
      customerId: opts.customerId,
      orderId: opts.orderId ?? null,
      type: opts.type,
      points: delta,
      balanceAfter: account.balance,
      description: opts.description,
      expiresAt: opts.expiresAt ?? null,
      actorName: ctx.actor.name,
    },
  });
  return account;
}

/** Called when an order completes: redeem reserved points, then earn on the paid amount. */
export async function settleOrderLoyaltyTx(
  tx: TenantTx,
  ctx: ServiceContext,
  order: { id: string; orderNumber: string; customerId: string | null; total: number; loyaltyPointsRedeemed: number },
) {
  if (!order.customerId) return 0;
  const program = await getProgram(tx, ctx);
  const account = await ensureAccountTx(tx, ctx, order.customerId, program);

  if (order.loyaltyPointsRedeemed > 0) {
    await post(tx, ctx, {
      accountId: account.id,
      customerId: order.customerId,
      type: "REDEEM",
      points: -order.loyaltyPointsRedeemed,
      description: `Redeemed on ${order.orderNumber}`,
      orderId: order.id,
    });
  }

  if (!program.isEnabled) return 0;
  const earned = loyaltyPointsFor(order.total, program.pointsPerHundred);
  if (earned > 0) {
    await post(tx, ctx, {
      accountId: account.id,
      customerId: order.customerId,
      type: "EARN",
      points: earned,
      description: `Earned on ${order.orderNumber}`,
      orderId: order.id,
      expiresAt: expiryFrom(program),
    });
  }
  return earned;
}

/** Undo an order's loyalty effects after a full refund. */
export async function reverseOrderLoyaltyTx(
  tx: TenantTx,
  ctx: ServiceContext,
  order: { id: string; orderNumber: string; customerId: string | null; loyaltyPointsEarned: number; loyaltyPointsRedeemed: number },
) {
  if (!order.customerId) return;
  const account = await tx.loyaltyAccount.findUnique({ where: { customerId: order.customerId } });
  if (!account) return;
  if (order.loyaltyPointsRedeemed > 0) {
    await post(tx, ctx, {
      accountId: account.id,
      customerId: order.customerId,
      type: "REVERSAL",
      reverses: "REDEEM",
      points: order.loyaltyPointsRedeemed,
      description: `Points returned — ${order.orderNumber} refunded`,
      orderId: order.id,
    });
  }
  if (order.loyaltyPointsEarned > 0) {
    const fresh = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } });
    const take = Math.min(order.loyaltyPointsEarned, fresh.balance);
    if (take > 0) {
      await post(tx, ctx, {
        accountId: account.id,
        customerId: order.customerId,
        type: "REVERSAL",
        reverses: "EARN",
        points: -take,
        description: `Points reversed — ${order.orderNumber} refunded`,
        orderId: order.id,
      });
    }
  }
}

export async function adjustPoints(ctx: ServiceContext, input: { customerId: string; points: number; reason: string }) {
  assertPermission(ctx, "loyalty.manage");
  return ctx.db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new NotFoundError("Customer");
    const account = await ensureAccountTx(tx, ctx, customer.id);
    const updated = await post(tx, ctx, {
      accountId: account.id,
      customerId: customer.id,
      type: "ADJUST",
      points: input.points,
      description: input.reason,
    });
    await audit(
      ctx,
      {
        action: "loyalty.adjusted",
        entity: "Customer",
        entityId: customer.id,
        summary: `${ctx.actor.name} adjusted ${customer.name}'s points by ${input.points > 0 ? "+" : ""}${input.points}`,
      },
      tx,
    );
    return updated;
  });
}

/**
 * Expire lapsed points and grant birthday bonuses. Expiry is conservative:
 * an earn row lapses for at most the points still in the balance.
 * Run daily via /api/v1/cron/loyalty or from the Loyalty page.
 */
export async function runLoyaltyMaintenance(ctx: ServiceContext, now = new Date()) {
  const program = await getProgram(ctx.db, ctx);
  let expired = 0;
  let birthdays = 0;

  const due = await ctx.db.loyaltyTransaction.findMany({
    where: { type: { in: ["EARN", "BONUS"] }, expiresAt: { lte: now }, expiryProcessedAt: null },
    orderBy: { expiresAt: "asc" },
    take: 2000,
  });

  for (const row of due) {
    await ctx.db.$transaction(async (tx) => {
      const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: row.accountId } });
      const lapse = Math.min(row.points, account.balance);
      if (lapse > 0) {
        await post(tx, ctx, {
          accountId: account.id,
          customerId: row.customerId,
          type: "EXPIRE",
          points: -lapse,
          description: `Points expired (earned ${row.createdAt.toISOString().slice(0, 10)})`,
        });
        expired += lapse;
      }
      await tx.loyaltyTransaction.update({ where: { id: row.id }, data: { expiryProcessedAt: now } });
    });
  }

  if (program.isEnabled && program.birthdayBonus > 0) {
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const candidates = await ctx.db.customer.findMany({
      where: { birthday: { not: null }, deletedAt: null },
      select: { id: true, name: true, birthday: true },
    });
    for (const c of candidates) {
      const b = c.birthday!;
      if (b.getUTCMonth() + 1 !== month || b.getUTCDate() !== day) continue;
      const already = await ctx.db.loyaltyTransaction.findFirst({
        where: { customerId: c.id, type: "BONUS", description: "Birthday bonus", createdAt: { gte: yearStart } },
      });
      if (already) continue;
      await ctx.db.$transaction(async (tx) => {
        const account = await ensureAccountTx(tx, ctx, c.id, program);
        await post(tx, ctx, {
          accountId: account.id,
          customerId: c.id,
          type: "BONUS",
          points: program.birthdayBonus,
          description: "Birthday bonus",
          expiresAt: expiryFrom(program, now),
        });
      });
      birthdays += 1;
    }
  }

  return { expired, birthdays };
}

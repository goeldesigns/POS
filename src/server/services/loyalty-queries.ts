import type { LoyaltyTxnType } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, type SearchParams } from "../list-params";

interface Overview {
  program: {
    isEnabled: boolean;
    pointsPerHundred: number;
    pointValue: number;
    minRedeemPoints: number;
    maxRedeemPercent: number;
    expiryDays: number | null;
    signupBonus: number;
    birthdayBonus: number;
  };
  stats: { members: number; outstanding: number; liability: number; earnedMonth: number; redeemedMonth: number; redemptionRate: number };
  top: { id: string; name: string; phone: string; balance: number; lifetimeEarned: number; orders: number; lastVisitAt: string | null }[];
  total: number;
  transactions: {
    id: string;
    createdAt: string;
    customer: { id: string; name: string };
    type: LoyaltyTxnType;
    points: number;
    balanceAfter: number;
    description: string;
    order: { id: string; orderNumber: string } | null;
    expiresAt: string | null;
    actorName: string | null;
  }[];
}

export async function loyaltyOverview(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 20 });
  const data = await backend.get<Overview>("/api/v1/loyalty", pick(sp, "q", "type", "page", "pageSize"));
  return { program: data.program, params: p, stats: data.stats, top: data.top, total: data.total, txns: data.transactions };
}

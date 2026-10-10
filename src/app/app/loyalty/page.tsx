import { Coins, Gift, Repeat, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MaintenanceButton, ProgramSettings } from "@/components/loyalty/loyalty-client";
import { Page } from "@/components/shell/page";
import { Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/display";
import { FilterSelect, Pagination, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime, formatMoney, formatPhone, formatRelative } from "@/lib/format";
import { LOYALTY_TXN } from "@/lib/labels";
import { cn, pluralize } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { loyaltyOverview } from "@/server/services/loyalty-queries";

export const metadata: Metadata = { title: "Loyalty Points" };

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("loyalty.view");
  const data = await loyaltyOverview(ctx, await searchParams);
  const tz = ctx.restaurant.timezone;
  return (
    <Page>
      <PageHeader title="Loyalty Points" description="Reward repeat guests. Points are earned automatically when orders with a customer are completed." actions={<MaintenanceButton />} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={data.stats.members} icon={<Users />} />
        <StatCard label="Points outstanding" value={data.stats.outstanding.toLocaleString("en-IN")} icon={<Coins />} accent="warning" caption={`${formatMoney(data.stats.liability)} liability`} />
        <StatCard label="Earned this month" value={data.stats.earnedMonth.toLocaleString("en-IN")} icon={<Gift />} accent="success" caption="points incl. bonuses" />
        <StatCard label="Redeemed this month" value={data.stats.redeemedMonth.toLocaleString("en-IN")} icon={<Repeat />} accent="info" caption={`${data.stats.redemptionRate.toFixed(0)}% lifetime redemption`} />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-hidden">
          <CardHeader title="Top members" description="Highest point balances" />
          {data.top.length ? (
            <table className="w-full text-[13px]">
              <tbody>
                {data.top.map((m, i) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="w-10 py-2.5 pl-5 text-muted">{i + 1}</td>
                    <td className="py-2.5">
                      <Link href={`/app/customers/${m.id}?tab=loyalty`} className="font-medium text-ink hover:text-brand-600">{m.name}</Link>
                      <p className="text-xs text-muted">{formatPhone(m.phone)} · {pluralize(m.orders, "order")}</p>
                    </td>
                    <td className="py-2.5 text-xs text-muted">{m.lastVisitAt ? `Visited ${formatRelative(m.lastVisitAt)}` : ""}</td>
                    <td className="tabular py-2.5 pr-5 text-right">
                      <span className="font-semibold text-ink">{m.balance.toLocaleString("en-IN")}</span> <span className="text-xs text-muted">pts</span>
                      <p className="text-2xs text-muted">{formatMoney(m.balance * data.program.pointValue)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="No members yet" description="Attach customers to orders to start earning points." />
          )}
        </Card>
        <ProgramSettings program={data.program} />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search customer name or phone" />
            <FilterSelect param="type" allLabel="All activity" options={Object.entries(LOYALTY_TXN).map(([v, s]) => ({ value: v, label: s.label }))} />
          </>
        }
      >
        {data.txns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="bg-canvas/70 text-xs text-muted">
                  {["When", "Customer", "Activity", "Type", "Points", "Balance", "Order"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 font-medium first:pl-5", [4, 5].includes(i) ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.txns.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2.5 pl-5 whitespace-nowrap text-muted">{formatDateTime(t.createdAt, tz)}</td>
                    <td className="px-4 py-2.5"><Link href={`/app/customers/${t.customer.id}?tab=loyalty`} className="font-medium text-ink hover:text-brand-600">{t.customer.name}</Link></td>
                    <td className="px-4 py-2.5 text-ink-2">{t.description}</td>
                    <td className="px-4 py-2.5"><StatusBadge dict={LOYALTY_TXN} value={t.type} size="sm" dot={false} /></td>
                    <td className={cn("tabular px-4 py-2.5 text-right font-semibold", t.points >= 0 ? "text-success-700" : "text-danger-700")}>{t.points > 0 ? `+${t.points}` : t.points}</td>
                    <td className="tabular px-4 py-2.5 text-right">{t.balanceAfter}</td>
                    <td className="px-4 py-2.5">{t.order ? <Link href={`/app/orders?order=${t.order.id}`} className="text-brand-600">{t.order.orderNumber}</Link> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No points activity" />
        )}
        <Pagination page={data.params.page} pageSize={data.params.pageSize} total={data.total} />
      </TableCard>
    </Page>
  );
}

import { Building, CircleDollarSign, ReceiptText, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PeriodFilter } from "@/components/admin/filters";
import { ColumnChart, DonutChart, RankedBars, TrendChart } from "@/components/charts/charts";
import { Page } from "@/components/shell/page";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { ORDER_SOURCE_LABEL, ORDER_TYPE_LABEL } from "@/lib/labels";
import { MODULE_CATALOG } from "@/lib/permissions/catalog";
import { requirePlatformSession } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { getPlatformAnalytics, platformRange } from "@/server/services/platform";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformSession();
  const sp = await searchParams;
  const range = platformRange(sp, "30d");
  const a = await getPlatformAnalytics(range);
  const k = a.kpis;
  const totalOrders = a.byType.reduce((s, t) => s + t.orders, 0);
  const paidPlans = a.plans.filter((p) => p.mrr > 0);

  return (
    <Page>
      <PageHeader
        title="Analytics"
        description={`Platform-wide trading, channels and adoption · ${range.label.toLowerCase()} ${range.compareLabel}`}
        actions={<PeriodFilter defaultValue="30d" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="GMV" value={formatMoney(k.gmv.value, { decimals: "auto" })} icon={<CircleDollarSign />} delta={k.gmv.delta} caption={range.compareLabel} />
        <StatCard label="Completed orders" value={formatNumber(k.orders.value)} icon={<ReceiptText />} accent="info" delta={k.orders.delta} caption={`${formatNumber(k.cancelled)} cancelled`} />
        <StatCard label="Average order value" value={formatMoney(k.aov.value)} icon={<ShoppingBag />} accent="warning" delta={k.aov.delta} caption={range.compareLabel} />
        <StatCard
          label="Trading restaurants"
          value={`${formatNumber(k.activeRestaurants.value)} of ${formatNumber(k.activeRestaurants.of)}`}
          icon={<Building />}
          accent="success"
          caption="Took at least one order"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="GMV trend" description={`${range.label} vs previous period`} />
          <CardBody>
            <TrendChart data={a.trend} xKey="label" current="current" previous="previous" currentLabel={range.label} previousLabel="Previous period" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order channels" description="Share of GMV by source" />
          <CardBody>
            {a.bySource.length ? (
              <DonutChart kind="money" data={a.bySource.map((s) => ({ label: ORDER_SOURCE_LABEL[s.source] ?? s.source, value: s.gmv }))} size={150} />
            ) : (
              <EmptyState compact title="No completed orders" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Daily orders" description="Completed orders across all restaurants" />
          <CardBody>
            <ColumnChart data={a.trend} xKey="label" yKey="orders" label="Orders" kind="number" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order types" description={`${formatNumber(totalOrders)} completed orders`} />
          <CardBody>
            <RankedBars
              kind="number"
              rows={a.byType.map((t) => ({
                key: t.type,
                label: ORDER_TYPE_LABEL[t.type] ?? t.type,
                value: t.orders,
                sub: totalOrders ? formatPercent((t.orders / totalOrders) * 100) : undefined,
              }))}
              emptyLabel="No completed orders"
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Restaurant leaderboard" description={`Top 10 by GMV · ${range.label.toLowerCase()}`} />
        <div className="overflow-x-auto border-t border-line scrollbar-thin">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="bg-canvas/70 text-xs text-muted">
                <th className="w-10 px-5 py-2.5 text-left font-medium">#</th>
                <th className="px-4 py-2.5 text-left font-medium">Restaurant</th>
                <th className="px-4 py-2.5 text-left font-medium">Plan</th>
                <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                <th className="px-4 py-2.5 text-right font-medium">Avg. order</th>
                <th className="px-4 py-2.5 text-right font-medium">GMV</th>
                <th className="w-[200px] px-5 py-2.5 text-left font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {a.top.map((t, i) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-5 py-2.5 text-subtle tabular">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/super-admin/restaurants/${t.id}`} className="font-medium text-ink hover:text-brand-600">
                      {t.name}
                    </Link>
                    {t.city ? <span className="ml-1.5 text-xs text-muted">{t.city}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{t.plan ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatNumber(t.orders)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatMoney(t.aov)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular">{formatMoney(t.gmv, { decimals: "auto" })}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(1, t.share)}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs text-muted tabular">{formatPercent(t.share)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!a.top.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-muted">
                    No completed orders in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Module adoption" description="Restaurants with each module switched on" />
          <CardBody>
            <RankedBars
              kind="number"
              rows={[...a.adoption]
                .sort((x, y) => y.restaurants - x.restaurants)
                .map((m) => ({
                  key: m.module,
                  label: MODULE_CATALOG[m.module].label,
                  value: m.restaurants,
                  sub: m.of ? formatPercent((m.restaurants / m.of) * 100, 0) : undefined,
                }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="New restaurants" description={range.label} />
          <CardBody>
            <ColumnChart data={a.signups} xKey="label" yKey="restaurants" label="Sign-ups" kind="number" height={220} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Revenue by plan" description="Monthly recurring revenue from paying restaurants" />
          <CardBody>
            {paidPlans.length ? (
              <DonutChart kind="money" data={paidPlans.map((p) => ({ label: p.name, value: p.mrr }))} size={150} />
            ) : (
              <EmptyState compact title="No paying restaurants yet" />
            )}
          </CardBody>
        </Card>
      </div>
    </Page>
  );
}

import { Building, CalendarClock, CircleDollarSign, Plus, ReceiptText, Repeat, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PeriodFilter } from "@/components/admin/filters";
import { DonutChart, MultiLineChart, TrendChart } from "@/components/charts/charts";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { MiniStat, StatCard } from "@/components/ui/stat-card";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDate, formatMoney, formatMoneyCompact, formatNumber, formatRelative } from "@/lib/format";
import { RESTAURANT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requirePlatformSession } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { demoInbox } from "@/server/services/demos";
import { getPlatformDashboard, platformRange } from "@/server/services/platform";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePlatformSession();
  const sp = await searchParams;
  const range = platformRange(sp, "30d");
  const [d, inbox] = await Promise.all([getPlatformDashboard(range), demoInbox()]);
  const attention = [
    ...(inbox.fresh
      ? [{ key: "demos-new", href: "/super-admin/demos?status=NEW", name: `${inbox.fresh} new demo request${inbox.fresh === 1 ? "" : "s"}`, reason: "Waiting for a reply", tone: "brand" as const }]
      : []),
    ...(inbox.today
      ? [{ key: "demos-today", href: "/super-admin/demos", name: `${inbox.today} demo${inbox.today === 1 ? "" : "s"} later today`, reason: "Check the meeting links", tone: "brand" as const }]
      : []),
    ...d.attention.map((a) => ({ key: `${a.id}-${a.reason}`, href: `/super-admin/restaurants/${a.id}?tab=subscription`, name: a.name, reason: a.reason, tone: a.tone })),
  ];
  const k = d.kpis;
  const periodLabel = range.label.toLowerCase();

  return (
    <Page>
      <PageHeader
        title="Platform overview"
        description={`Signed in as ${ctx.user.name}. Figures cover all restaurants · ${periodLabel}.`}
        actions={
          <>
            <PeriodFilter defaultValue="30d" />
            <Button asChild>
              <Link href="/super-admin/restaurants/new">
                <Plus /> Add restaurant
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Restaurants"
          value={formatNumber(k.restaurants.total)}
          icon={<Building />}
          caption={`${k.restaurants.active} active · ${k.restaurants.suspended} suspended`}
        />
        <StatCard
          label="Gross merchandise value"
          value={formatMoney(k.gmv.value, { decimals: "auto" })}
          icon={<CircleDollarSign />}
          accent="success"
          delta={k.gmv.delta}
          caption={range.compareLabel}
        />
        <StatCard label="Platform orders" value={formatNumber(k.orders.value)} icon={<ReceiptText />} accent="info" delta={k.orders.delta} caption={range.compareLabel} />
        <StatCard
          label="Monthly recurring revenue"
          value={formatMoney(k.mrr.value, { decimals: 0 })}
          icon={<Repeat />}
          accent="warning"
          caption={`ARR ${formatMoneyCompact(k.mrr.arr)}${k.mrr.atRisk ? ` · ${formatMoneyCompact(k.mrr.atRisk)} past due` : ""}`}
        />
      </div>

      <Card className="mt-4 grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        <MiniStat label="On trial" value={formatNumber(k.restaurants.trialing)} sub={`of ${formatNumber(k.restaurants.total)} restaurants`} />
        <MiniStat label="Total users" value={formatNumber(k.users.total)} sub={`${formatNumber(k.users.active30d)} signed in · 30 days`} />
        <MiniStat label="New restaurants" value={formatNumber(k.newRestaurants)} sub="This month" />
        <MiniStat label="New users" value={formatNumber(k.newUsers)} sub="This month" />
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="GMV" description={`Completed orders across all restaurants · ${periodLabel} vs previous period`} />
          <CardBody>
            <TrendChart data={d.trend} xKey="label" current="current" previous="previous" currentLabel={range.label} previousLabel="Previous period" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Subscriptions" description="Restaurants by plan" actions={<Link href="/super-admin/plans" className="text-xs font-medium text-brand-500 hover:text-brand-600">Plans</Link>} />
          <CardBody>
            {d.planMix.length ? (
              <DonutChart kind="number" data={d.planMix} centerValue={formatNumber(d.planMix.reduce((s, p) => s + p.value, 0))} centerLabel="subscriptions" />
            ) : (
              <EmptyState compact title="No subscriptions yet" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Growth" description={`Cumulative restaurants and users · ${periodLabel}`} />
          <CardBody>
            <MultiLineChart
              data={d.growth}
              xKey="label"
              kind="number"
              series={[
                { key: "restaurants", label: "Restaurants" },
                { key: "users", label: "Users" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Needs attention" description="Demo requests, billing and account issues" />
          {attention.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        a.tone === "danger" ? "bg-danger-50 text-danger" : a.tone === "brand" ? "bg-brand-100 text-brand-600" : "bg-warning-50 text-warning-700",
                      )}
                    >
                      {a.tone === "brand" ? <CalendarClock className="size-4" /> : <TriangleAlert className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
                      <span className="block text-xs text-muted">{a.reason}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <EmptyState compact title="All clear" description="No new demo requests, overdue payments, expiring trials or suspended accounts." />
            </CardBody>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top restaurants" description={`By GMV · ${periodLabel}`} actions={<Link href="/super-admin/analytics" className="text-xs font-medium text-brand-500 hover:text-brand-600">Analytics</Link>} />
          <ul className="divide-y divide-line border-t border-line">
            {d.top.map((t, i) => (
              <li key={t.id}>
                <Link href={`/super-admin/restaurants/${t.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-canvas">
                  <span className="w-4 text-xs font-semibold text-subtle tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{t.name}</span>
                    <span className="block text-xs text-muted">
                      {t.city ? `${t.city} · ` : ""}
                      {formatNumber(t.orders)} orders
                    </span>
                  </span>
                  <span className="text-[13px] font-semibold text-ink tabular">{formatMoney(t.gmv, { decimals: "auto" })}</span>
                </Link>
              </li>
            ))}
            {!d.top.length ? <li className="px-5 py-4 text-[13px] text-muted">No completed orders in this period.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent registrations" actions={<Link href="/super-admin/restaurants?sort=createdAt" className="text-xs font-medium text-brand-500 hover:text-brand-600">All restaurants</Link>} />
          <ul className="divide-y divide-line border-t border-line">
            {d.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/super-admin/restaurants/${r.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.ownerName}
                      {r.city ? ` · ${r.city}` : ""} · {formatDate(r.createdAt, PLATFORM_TZ)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {r.subscription ? <Badge size="sm" tone="brand">{r.subscription.plan.name}</Badge> : null}
                    {r.status !== "ACTIVE" ? <StatusBadge dict={RESTAURANT_STATUS} value={r.status} size="sm" /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Platform activity" actions={<Link href="/super-admin/audit-logs?scope=PLATFORM" className="text-xs font-medium text-brand-500 hover:text-brand-600">Audit log</Link>} />
          <ul className="divide-y divide-line border-t border-line">
            {d.activity.map((a) => (
              <li key={a.id} className="flex gap-3 px-5 py-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] text-ink-2">{a.summary}</p>
                  <p className="text-xs text-muted">
                    {a.actorName ?? "System"} · {formatRelative(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
            {!d.activity.length ? <li className="px-5 py-4 text-[13px] text-muted">No platform activity yet.</li> : null}
          </ul>
        </Card>
      </div>
    </Page>
  );
}


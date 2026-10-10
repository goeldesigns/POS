import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock,
  PackageMinus,
  ReceiptText,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ColumnChart, DonutChart, RankedBars, TrendChart } from "@/components/charts/charts";
import { PeriodSwitch } from "@/components/overview/period-switch";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, InlineAlert, StatusBadge } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { MiniStat, StatCard } from "@/components/ui/stat-card";
import { formatMoney, formatNumber, formatQuantity, formatTime } from "@/lib/format";
import { ORDER_STATUS, ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL, RESERVATION_STATUS } from "@/lib/labels";
import { cn, pluralize } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { getOverview } from "@/server/services/dashboard";
import { zonedParts } from "@/server/time";

export const metadata: Metadata = { title: "Overview" };

const PERIODS = [
  { value: "today" as const, label: "Today" },
  { value: "week" as const, label: "This week" },
  { value: "month" as const, label: "This month" },
];

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("overview.view");
  const sp = await searchParams;
  const period = (PERIODS.find((p) => p.value === param(sp, "period"))?.value ?? "today") as "today" | "week" | "month";
  const data = await getOverview(ctx, period);
  const tz = ctx.restaurant.timezone;
  const hour = zonedParts(new Date(), tz).hour;
  const greeting = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
  const k = data.kpis;
  const caption = data.range.compareLabel;
  const totalTypes = data.orderTypes.reduce((s, t) => s + t.value, 0);

  return (
    <Page>
      <PageHeader
        title={`${greeting}, ${ctx.user.name.split(" ")[0]}`}
        description={`Here's how ${ctx.restaurant.name} is doing ${period === "today" ? "today" : period === "week" ? "this week" : "this month"}.`}
        actions={
          <>
            <PeriodSwitch value={period} options={PERIODS} defaultValue="today" />
            {ctx.permissions.has("pos.create_order") ? (
              <Button asChild>
                <Link href="/app/pos">
                  <ShoppingBag /> New order
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {param(sp, "welcome") ? (
        <InlineAlert tone="brand" className="mb-5" title={`Welcome to Tabla, ${ctx.user.name.split(" ")[0]}!`}>
          Your restaurant is ready. Start by adding menu items in <Link href="/app/menu" className="font-semibold underline">Menu</Link>, then
          take your first order from the <Link href="/app/pos" className="font-semibold underline">POS</Link>.
        </InlineAlert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={period === "today" ? "Today's sales" : period === "week" ? "This week's sales" : "This month's sales"}
          value={formatMoney(k.sales.value)}
          icon={<CircleDollarSign />}
          delta={k.sales.delta}
          caption={caption}
        />
        <StatCard
          label="Total orders"
          value={formatNumber(k.orders.value)}
          icon={<ReceiptText />}
          accent="info"
          delta={k.orders.delta}
          deltaLabel={`${k.orders.diff >= 0 ? "+" : "−"}${Math.abs(k.orders.diff)}`}
          caption={caption}
        />
        <StatCard
          label="Customers served"
          value={formatNumber(k.customers.value)}
          icon={<Users />}
          accent="success"
          delta={k.customers.delta}
          caption={`${k.customers.newCount} new`}
        />
        <StatCard
          label="Outstanding on open orders"
          value={formatMoney(k.due.value)}
          icon={<Clock />}
          accent="warning"
          caption={`${k.due.openOrders} open · ${k.due.openTables} tables running`}
        />
      </div>

      <Card className="mt-4 grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        <MiniStat label="Average order value" value={formatMoney(data.metrics.aov.value)} sub={deltaText(data.metrics.aov.delta)} />
        <MiniStat label="Online orders" value={formatNumber(data.metrics.online.value)} sub={deltaText(data.metrics.online.delta)} />
        <MiniStat label="Dine-in" value={formatNumber(data.metrics.dineIn.value)} sub={share(data.metrics.dineIn.value, totalTypes)} />
        <MiniStat label="Takeaway" value={formatNumber(data.metrics.takeaway.value)} sub={share(data.metrics.takeaway.value, totalTypes)} />
        <MiniStat label="Delivery" value={formatNumber(data.metrics.delivery.value)} sub={share(data.metrics.delivery.value, totalTypes)} />
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Sales overview"
            description={`Completed sales · ${data.trendLabels.current.toLowerCase()} vs ${data.trendLabels.previous.toLowerCase()}`}
          />
          <CardBody>
            <TrendChart data={data.trend} xKey="label" current="current" previous="previous" currentLabel={data.trendLabels.current} previousLabel={data.trendLabels.previous} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order types" description={`${data.range.label} · ${formatNumber(totalTypes)} orders`} />
          <CardBody>
            {totalTypes ? (
              <DonutChart data={data.orderTypes} centerValue={formatNumber(totalTypes)} centerLabel="orders" />
            ) : (
              <EmptyState compact title="No orders yet" description="Order mix appears once the first order is placed." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue by hour" description="Completed sales by time of day · peak hour highlighted" />
          <CardBody>
            <ColumnChart data={data.revenueByHour} xKey="label" yKey="revenue" label="Revenue" highlightKey="peak" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Orders overview" description="Live kitchen queue and period outcomes" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "New", value: data.pipeline.new, tone: "bg-info-50 text-info-700", href: "/app/orders?tab=NEW" },
                { label: "Preparing", value: data.pipeline.preparing, tone: "bg-warning-50 text-warning-700", href: "/app/orders?tab=PREPARING" },
                { label: "Ready", value: data.pipeline.ready, tone: "bg-brand-100 text-brand-700", href: "/app/orders?tab=READY" },
              ].map((s) => (
                <Link key={s.label} href={s.href} className={cn("rounded-xl px-3 py-2.5 transition-opacity hover:opacity-80", s.tone)}>
                  <p className="text-xl font-semibold">{s.value}</p>
                  <p className="text-xs">{s.label}</p>
                </Link>
              ))}
            </div>
            <dl className="divide-y divide-line text-[13px]">
              {[
                ["Served, bill open", formatNumber(data.pipeline.served)],
                ["Completed", formatNumber(data.pipeline.completed)],
                ["Cancelled", formatNumber(data.pipeline.cancelled)],
                ["Refunded", formatNumber(data.pipeline.refunded)],
                ["Avg. kitchen time", data.pipeline.avgPrepMinutes != null ? `${Math.round(data.pipeline.avgPrepMinutes)} min` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tabular font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top selling items" description={`By revenue · ${data.range.label.toLowerCase()}`} actions={<Link href="/app/reports/products" className="text-xs font-medium text-brand-500 hover:text-brand-600">Report</Link>} />
          <CardBody>
            <RankedBars rows={data.topProducts.map((p) => ({ key: p.name, label: p.name, value: p.revenue, sub: `${p.quantity} sold` }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Popular categories" description="Share of item revenue" />
          <CardBody>
            {data.categories.length ? (
              <DonutChart kind="money" data={data.categories.map((c) => ({ label: c.name, value: c.revenue }))} size={150} />
            ) : (
              <EmptyState compact title="No sales yet" />
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Payment methods" description="Collected on completed orders" />
          <CardBody>
            {data.payments.length ? (
              <DonutChart kind="money" data={data.payments.map((p) => ({ label: PAYMENT_METHOD_LABEL[p.method] ?? p.method, value: p.amount }))} size={150} />
            ) : (
              <EmptyState compact title="No payments yet" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Recent orders"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/app/orders">
                  View all <ArrowRight />
                </Link>
              </Button>
            }
          />
          {data.recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="py-2.5 pl-5">
                        <Link href={`/app/orders?order=${o.id}`} className="font-medium text-ink hover:text-brand-600">
                          {o.orderNumber}
                        </Link>
                        <p className="text-xs text-muted">{formatTime(o.createdAt, tz)}</p>
                      </td>
                      <td className="py-2.5 text-ink-2">
                        {o.table ? `${o.table.name} · ` : ""}
                        {ORDER_TYPE_LABEL[o.type]}
                        <p className="text-xs text-muted">{o.customerName ?? "Walk-in"} · {pluralize(o._count.items, "item")}</p>
                      </td>
                      <td className="py-2.5">
                        <StatusBadge dict={ORDER_STATUS} value={o.status} />
                      </td>
                      <td className="tabular py-2.5 pr-5 text-right font-semibold text-ink">{formatMoney(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No orders yet" description="Orders taken on the POS show up here in real time." action={<Button asChild size="sm"><Link href="/app/pos">Open POS</Link></Button>} />
          )}
        </Card>

        <div className="grid gap-4">
          {data.lowStock ? (
            <Card>
              <CardHeader
                title="Low stock alerts"
                actions={<Link href="/app/inventory?tab=stock&filter=low" className="text-xs font-medium text-brand-500 hover:text-brand-600">Inventory</Link>}
              />
              <CardBody>
                {data.lowStock.length ? (
                  <ul className="space-y-2.5">
                    {data.lowStock.map((i) => {
                      const pct = Math.min(100, (i.currentStock / Math.max(i.minStock, 0.001)) * 100);
                      return (
                        <li key={i.id} className="flex items-center gap-3">
                          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", i.currentStock <= 0 ? "bg-danger-50 text-danger" : "bg-warning-50 text-warning-700")}>
                            <PackageMinus className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2 text-[13px]">
                              <span className="truncate font-medium text-ink">{i.name}</span>
                              <span className="tabular shrink-0 text-xs text-muted">
                                {formatQuantity(i.currentStock, i.unit)} / {formatQuantity(i.minStock, i.unit)}
                              </span>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-warning-100">
                              <div className={cn("h-full rounded-full", i.currentStock <= 0 ? "bg-danger" : "bg-warning")} style={{ width: `${Math.max(pct, 3)}%` }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-[13px] text-muted">All ingredients are above their minimum levels.</p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {data.reservations ? (
            <Card>
              <CardHeader
                title="Upcoming reservations"
                actions={<Link href="/app/reservations" className="text-xs font-medium text-brand-500 hover:text-brand-600">Calendar</Link>}
              />
              <CardBody>
                {data.reservations.length ? (
                  <ul className="divide-y divide-line">
                    {data.reservations.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">
                          <CalendarClock className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{r.customerName}</p>
                          <p className="text-xs text-muted">
                            {formatTime(r.startsAt, tz)} · {r.partySize} guests{r.table ? ` · ${r.table.name}` : ""}
                          </p>
                        </div>
                        <StatusBadge dict={RESERVATION_STATUS} value={r.status} size="sm" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-[13px] text-muted">No upcoming reservations.</p>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function deltaText(delta: number | null) {
  if (delta === null) return "No previous data";
  if (Math.abs(delta) < 0.05) return "No change vs previous";
  return `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}% vs previous`;
}

function share(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(0)}% of orders` : "—";
}

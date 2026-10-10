import { Cake, CalendarHeart, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerProfileActions, NoteForm } from "@/components/customers/customer-profile-client";
import { Page } from "@/components/shell/page";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { MiniStat } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPhone, formatRelative, formatTime } from "@/lib/format";
import { LOYALTY_TXN, ORDER_STATUS, ORDER_TYPE_LABEL, RESERVATION_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { getCustomerProfile } from "@/server/services/customers";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("customers.view");
  const { id } = await params;
  const tab = param(await searchParams, "tab") ?? "orders";
  const data = await getCustomerProfile(ctx, id).catch(() => null);
  if (!data) notFound();
  const { customer: c, orders, reservations, favourites, loyaltyTxns } = data;
  const tz = ctx.restaurant.timezone;
  const loyaltyOn = ctx.modules.has("loyalty");
  const address = c.addresses[0];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Customers", href: "/app/customers" }, { label: c.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={c.name} size="lg" />
            <span>
              {c.name}
              <span className="mt-1 flex flex-wrap gap-1.5">
                {c.tags.map((t) => (
                  <Badge key={t} size="sm" tone={t === "VIP" ? "brand" : "neutral"}>
                    {t}
                  </Badge>
                ))}
                <span className="text-xs font-normal text-muted">Customer since {formatDate(c.createdAt, tz)}</span>
              </span>
            </span>
          </span>
        }
        actions={
          <CustomerProfileActions
            balance={c.loyalty?.balance ?? 0}
            customer={{
              id: c.id,
              name: c.name,
              phone: c.phone,
              email: c.email,
              birthday: c.birthday?.toISOString() ?? null,
              anniversary: c.anniversary?.toISOString() ?? null,
              tags: c.tags,
              address: address ? { line1: address.line1, city: address.city, postalCode: address.postalCode } : null,
            }}
          />
        }
      />

      <Card className="mb-4 grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        <MiniStat label="Orders" value={c.totalOrders} />
        <MiniStat label="Total spend" value={formatMoney(c.totalSpend)} />
        <MiniStat label="Average order" value={formatMoney(c.totalOrders ? Math.round(c.totalSpend / c.totalOrders) : 0)} />
        <MiniStat label="Last visit" value={c.lastVisitAt ? formatRelative(c.lastVisitAt) : "Never"} sub={c.lastVisitAt ? formatDate(c.lastVisitAt, tz) : undefined} />
        {loyaltyOn ? <MiniStat label="Loyalty points" value={formatNumber(c.loyalty?.balance ?? 0)} sub={`${formatNumber(c.loyalty?.lifetimeEarned ?? 0)} earned lifetime`} /> : <MiniStat label="Reservations" value={reservations.length} />}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-2.5 text-[13px]">
              <Detail icon={<Phone />}>{formatPhone(c.phone)}</Detail>
              <Detail icon={<Mail />}>{c.email ?? <span className="text-subtle">No email</span>}</Detail>
              <Detail icon={<Cake />}>{c.birthday ? formatDate(c.birthday, "UTC").slice(0, 6) : <span className="text-subtle">Birthday not set</span>}</Detail>
              {c.anniversary ? <Detail icon={<CalendarHeart />}>Anniversary {formatDate(c.anniversary, "UTC").slice(0, 6)}</Detail> : null}
              {c.addresses.map((a) => (
                <Detail key={a.id} icon={<MapPin />}>
                  <span className="font-medium">{a.label}:</span> {[a.line1, a.landmark, a.city, a.postalCode].filter(Boolean).join(", ")}
                </Detail>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Usually orders" />
            <CardBody>
              {favourites.length ? (
                <ul className="space-y-1.5 text-[13px]">
                  {favourites.map((f) => (
                    <li key={f.name} className="flex justify-between">
                      <span className="text-ink-2">{f.name}</span>
                      <span className="tabular text-muted">×{f.quantity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">No completed orders yet.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notes" description="Visible to your team only" />
            <CardBody className="space-y-3">
              {ctx.permissions.has("customers.edit") ? <NoteForm customerId={c.id} /> : null}
              {c.notes.length ? (
                <ul className="space-y-2.5">
                  {c.notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-canvas px-3 py-2">
                      <p className="text-[13px] whitespace-pre-line text-ink">{n.body}</p>
                      <p className="mt-1 text-2xs text-muted">
                        {n.authorName} · {formatDateTime(n.createdAt, tz)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">No notes yet.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="px-4">
            <LinkTabs
              className="border-b-0"
              defaultValue="orders"
              items={[
                { value: "orders", label: "Orders", count: orders.length },
                { value: "reservations", label: "Reservations", count: reservations.length },
                ...(loyaltyOn ? [{ value: "loyalty", label: "Loyalty", count: loyaltyTxns.length }] : []),
              ]}
            />
          </div>
          <div className="border-t border-line">
            {tab === "reservations" ? (
              reservations.length ? (
                <SimpleTable
                  head={["Date", "Guests", "Table", "Source", "Status"]}
                  rows={reservations.map((r) => [
                    `${formatDate(r.startsAt, tz)} · ${formatTime(r.startsAt, tz)}`,
                    r.partySize,
                    r.table?.name ?? "—",
                    r.source,
                    <StatusBadge key="s" dict={RESERVATION_STATUS} value={r.status} size="sm" />,
                  ])}
                />
              ) : (
                <EmptyState title="No reservations" />
              )
            ) : tab === "loyalty" && loyaltyOn ? (
              <div>
                <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
                  {[
                    ["Current balance", c.loyalty?.balance ?? 0],
                    ["Lifetime earned", c.loyalty?.lifetimeEarned ?? 0],
                    ["Redeemed", c.loyalty?.lifetimeRedeemed ?? 0],
                    ["Expired", c.loyalty?.lifetimeExpired ?? 0],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-surface px-4 py-3">
                      <p className="text-xs text-muted">{l}</p>
                      <p className="text-lg font-semibold text-ink">{formatNumber(Number(v))} <span className="text-xs font-normal text-muted">pts</span></p>
                    </div>
                  ))}
                </div>
                {loyaltyTxns.length ? (
                  <SimpleTable
                    head={["Date", "Activity", "Type", "Points", "Balance"]}
                    rows={loyaltyTxns.map((t) => [
                      formatDateTime(t.createdAt, tz),
                      t.description,
                      <StatusBadge key="t" dict={LOYALTY_TXN} value={t.type} size="sm" dot={false} />,
                      <span key="p" className={cn("font-semibold", t.points >= 0 ? "text-success-700" : "text-danger-700")}>{t.points > 0 ? `+${formatNumber(t.points)}` : formatNumber(t.points)}</span>,
                      formatNumber(t.balanceAfter),
                    ])}
                  />
                ) : (
                  <EmptyState title="No points activity yet" />
                )}
              </div>
            ) : orders.length ? (
              <SimpleTable
                head={["Order", "Date", "Type", "Items", "Amount", "Status"]}
                rows={orders.map((o) => [
                  <Link key="o" href={`/app/orders?order=${o.id}`} className="font-medium text-ink hover:text-brand-600">{o.orderNumber}</Link>,
                  formatDateTime(o.createdAt, tz),
                  `${ORDER_TYPE_LABEL[o.type]}${o.table ? ` · ${o.table.name}` : ""}`,
                  o._count.items,
                  <span key="a" className="font-medium">{formatMoney(o.total)}</span>,
                  <StatusBadge key="s" dict={ORDER_STATUS} value={o.status} size="sm" />,
                ])}
              />
            ) : (
              <EmptyState title="No orders yet" description="Orders placed with this customer attached appear here." />
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function Detail({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-ink">
      <span className="mt-0.5 text-subtle [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="bg-canvas/70 text-left text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium first:pl-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-ink first:pl-5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

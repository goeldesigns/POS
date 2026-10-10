import { CircleCheck, CircleDollarSign, ReceiptText, ShoppingBag, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleAccess, UserPermissionsPanel } from "@/components/admin/access-panel";
import { AuditTable } from "@/components/admin/audit-table";
import { RestaurantMembers } from "@/components/admin/members";
import { DangerZone, RestaurantHeaderActions } from "@/components/admin/restaurant-detail-actions";
import { RestaurantProfileForm } from "@/components/admin/restaurant-form";
import { SubscriptionPanel } from "@/components/admin/subscription-panel";
import { ColumnChart, RankedBars, TrendChart } from "@/components/charts/charts";
import { Page } from "@/components/shell/page";
import { Avatar, Badge, Card, CardBody, CardHeader, DetailList, EmptyState, InlineAlert, StatusBadge } from "@/components/ui/display";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPhone, formatRelative } from "@/lib/format";
import { ORDER_SOURCE_LABEL, RESTAURANT_STATUS, SUBSCRIPTION_STATUS } from "@/lib/labels";
import { MODULE_CATALOG, type ModuleKey } from "@/lib/permissions/catalog";
import { cn } from "@/lib/utils";
import { requirePlatformSession } from "@/server/auth/guards";
import { NotFoundError } from "@/server/errors";
import { param, type SearchParams } from "@/server/list-params";
import {
  getRestaurantAdmin,
  getRestaurantTrading,
  listAuditLogs,
  listPlans,
  listRestaurantMembers,
  type RestaurantAdmin,
} from "@/server/services/platform";

const TABS = ["overview", "users", "permissions", "subscription", "usage", "activity", "settings"] as const;
type Tab = (typeof TABS)[number];

async function load(id: string) {
  try {
    return await getRestaurantAdmin(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const d = await getRestaurantAdmin(id);
    return { title: d.restaurant.name };
  } catch {
    return { title: "Restaurant" };
  }
}

export default async function RestaurantDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requirePlatformSession();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(param(sp, "tab") ?? "") ? (param(sp, "tab") as Tab) : "overview";
  const detail = await load(id);
  const r = detail.restaurant;
  const archived = r.status === "ARCHIVED";
  const target = { id: r.id, name: r.name, status: r.status };

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Restaurants", href: "/super-admin/restaurants" }, { label: r.name }]}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {r.name}
            <StatusBadge dict={RESTAURANT_STATUS} value={r.status} />
            {detail.subscription ? (
              <Badge tone="brand">
                {detail.subscription.plan.name}
                {detail.subscription.status !== "ACTIVE" ? ` · ${SUBSCRIPTION_STATUS[detail.subscription.status]?.label ?? detail.subscription.status}` : ""}
              </Badge>
            ) : null}
          </span>
        }
        description={[r.restaurantType, [r.city, r.state].filter(Boolean).join(", "), `Created ${formatDate(r.createdAt, PLATFORM_TZ)}`].filter(Boolean).join(" · ")}
        actions={<RestaurantHeaderActions target={target} />}
      />

      {param(sp, "created") ? (
        <InlineAlert tone="success" icon={<CircleCheck />} className="mb-4" title="Restaurant created">
          The owner can sign in at <span className="font-medium">/auth/login</span>. Share the temporary password privately — they can change it from their profile.
        </InlineAlert>
      ) : null}
      {r.status === "SUSPENDED" ? (
        <InlineAlert tone="danger" className="mb-4" title={`Suspended${r.suspendedAt ? ` on ${formatDate(r.suspendedAt, PLATFORM_TZ)}` : ""}`}>
          {r.suspendReason ? r.suspendReason.replace(/[.!?]?$/, ".") : "No reason recorded."} Users see a suspension notice and can&apos;t use the POS, back office or API.
        </InlineAlert>
      ) : null}
      {archived ? (
        <InlineAlert tone="neutral" className="mb-4" title={`Archived${r.deletedAt ? ` on ${formatDate(r.deletedAt, PLATFORM_TZ)}` : ""}`}>
          This restaurant is hidden from the platform and read-only here. Restore it to make changes.
        </InlineAlert>
      ) : null}

      <LinkTabs
        className="mb-5"
        defaultValue="overview"
        items={[
          { value: "overview", label: "Overview" },
          { value: "users", label: "Users", count: detail.counts.users },
          { value: "permissions", label: "Permissions" },
          { value: "subscription", label: "Subscription" },
          { value: "usage", label: "Usage" },
          { value: "activity", label: "Activity" },
          { value: "settings", label: "Settings" },
        ]}
      />

      {tab === "overview" ? <OverviewTab detail={detail} /> : null}
      {tab === "users" ? <UsersTab detail={detail} readOnly={archived} /> : null}
      {tab === "permissions" ? <PermissionsTab detail={detail} readOnly={archived} /> : null}
      {tab === "subscription" ? <SubscriptionTab detail={detail} readOnly={archived} /> : null}
      {tab === "usage" ? <UsageTab detail={detail} /> : null}
      {tab === "activity" ? <ActivityTab detail={detail} sp={sp} /> : null}
      {tab === "settings" ? (
        <div className="space-y-4">
          <Card className="px-5 sm:px-6">
            <RestaurantProfileForm value={r} disabled={archived} />
          </Card>
          <DangerZone target={target} />
        </div>
      ) : null}
    </Page>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

async function OverviewTab({ detail }: { detail: RestaurantAdmin }) {
  const r = detail.restaurant;
  const [trading, members, activity] = await Promise.all([
    getRestaurantTrading(r.id),
    listRestaurantMembers(r.id, detail.enabledModules),
    listAuditLogs({ pageSize: "10" }, { restaurantId: r.id }),
  ]);
  const owners = members.members.filter((m) => m.role.isOwner);
  const maxUsers = detail.subscription?.plan.maxUsers;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales · last 30 days" value={formatMoney(trading.gmv)} icon={<CircleDollarSign />} delta={trading.gmvDelta} caption="vs previous 30 days" />
        <StatCard label="Completed orders · 30 days" value={formatNumber(trading.orders)} icon={<ReceiptText />} accent="info" delta={trading.ordersDelta} caption="vs previous 30 days" />
        <StatCard label="Average order value" value={formatMoney(trading.aov)} icon={<ShoppingBag />} accent="warning" caption={`Lifetime sales ${formatMoney(trading.lifetimeGmv, { decimals: "auto" })}`} />
        <StatCard
          label="Users"
          value={formatNumber(detail.counts.users)}
          icon={<Users />}
          accent="success"
          caption={maxUsers ? `${detail.counts.users} of ${maxUsers} seats on ${detail.subscription?.plan.name}` : "Unlimited seats"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales" description="Completed orders · last 30 days vs the 30 days before" />
          <CardBody>
            {trading.gmv || trading.trend.some((t) => t.previous) ? (
              <TrendChart data={trading.trend} xKey="label" current="current" previous="previous" currentLabel="Last 30 days" previousLabel="Previous 30 days" />
            ) : (
              <EmptyState compact title="No sales yet" description="Sales appear here once the restaurant completes its first order." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Profile" actions={<Link href={`?tab=settings`} className="text-xs font-medium text-brand-500 hover:text-brand-600">Edit</Link>} />
          <CardBody>
            <DetailList
              className="sm:grid-cols-1"
              items={[
                { label: "Legal name", value: r.legalName ?? "—" },
                { label: "Business email", value: r.email },
                { label: "Phone", value: formatPhone(r.phone) },
                { label: "Address", value: [r.addressLine, r.city, r.state, r.postalCode].filter(Boolean).join(", ") || "—" },
                { label: "GSTIN · FSSAI", value: `${r.gstNumber ?? "—"} · ${r.fssaiNumber ?? "—"}` },
                { label: "Currency · timezone", value: `${r.currency} · ${r.timezone}` },
                { label: "Last active", value: r.lastActiveAt ? formatRelative(r.lastActiveAt) : "Never" },
                { label: "Last order", value: trading.lastOrderAt ? formatDateTime(trading.lastOrderAt, PLATFORM_TZ) : "No orders yet" },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Owners" description="Owners hold every permission for enabled modules." actions={<Link href="?tab=users" className="text-xs font-medium text-brand-500 hover:text-brand-600">All users</Link>} />
          <ul className="divide-y divide-line border-t border-line">
            {owners.length ? (
              owners.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={o.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{o.name}</p>
                    <p className="truncate text-xs text-muted">{o.email}</p>
                  </div>
                  <span className="text-xs text-muted">{o.lastLoginAt ? `Signed in ${formatRelative(o.lastLoginAt)}` : "Never signed in"}</span>
                </li>
              ))
            ) : (
              <li className="px-5 py-4 text-[13px] text-danger-700">No active owner — add one from the Users tab.</li>
            )}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent activity" actions={<Link href="?tab=activity" className="text-xs font-medium text-brand-500 hover:text-brand-600">View all</Link>} />
          <ul className="divide-y divide-line border-t border-line">
            {activity.rows.slice(0, 6).map((a) => (
              <li key={a.id} className="flex gap-3 px-5 py-2.5">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", a.scope === "PLATFORM" ? "bg-brand-500" : "bg-subtle")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] text-ink-2">{a.summary}</p>
                  <p className="text-xs text-muted">
                    {a.actorName ?? "System"} · {formatRelative(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
            {!activity.rows.length ? <li className="px-5 py-4 text-[13px] text-muted">No activity recorded yet.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}

async function UsersTab({ detail, readOnly }: { detail: RestaurantAdmin; readOnly: boolean }) {
  const { members, roles } = await listRestaurantMembers(detail.restaurant.id, detail.enabledModules);
  return (
    <RestaurantMembers
      restaurantId={detail.restaurant.id}
      restaurantName={detail.restaurant.name}
      members={members}
      roles={roles}
      enabledModules={detail.enabledModules}
      readOnly={readOnly}
    />
  );
}

async function PermissionsTab({ detail, readOnly }: { detail: RestaurantAdmin; readOnly: boolean }) {
  const { members, roles } = await listRestaurantMembers(detail.restaurant.id, detail.enabledModules);
  return (
    <div className="space-y-4">
      <ModuleAccess
        restaurantId={detail.restaurant.id}
        enabled={detail.enabledModules}
        planModules={detail.planModules}
        planName={detail.subscription?.plan.name ?? null}
        readOnly={readOnly}
      />
      <UserPermissionsPanel restaurantId={detail.restaurant.id} members={members} roles={roles} enabledModules={detail.enabledModules} readOnly={readOnly} />
      <Card>
        <CardHeader title="Roles" description="Roles are managed by the restaurant's owner in Settings → Roles. Shown here for reference." />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="bg-canvas/70 text-xs text-muted">
                <th className="px-5 py-2.5 text-left font-medium">Role</th>
                <th className="px-4 py-2.5 text-left font-medium">Modules</th>
                <th className="px-4 py-2.5 text-right font-medium">Permissions</th>
                <th className="px-5 py-2.5 text-right font-medium">People</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const modules = [...new Set(role.permissions.map((p) => p.split(".")[0]!))].filter((m) => m in MODULE_CATALOG);
                return (
                  <tr key={role.id} className="border-t border-line">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-ink">
                        {role.name}
                        {!role.isSystem ? <span className="ml-1.5 text-xs font-normal text-muted">Custom</span> : null}
                      </p>
                      {role.description ? <p className="text-xs text-muted">{role.description}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-2">
                      {role.isOwner ? "All enabled modules" : modules.map((m) => MODULE_CATALOG[m as ModuleKey].label).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{role.isOwner ? "All" : role.permissions.length}</td>
                    <td className="px-5 py-2.5 text-right tabular">{role.members}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

async function SubscriptionTab({ detail, readOnly }: { detail: RestaurantAdmin; readOnly: boolean }) {
  const plans = await listPlans();
  return (
    <SubscriptionPanel
      restaurantId={detail.restaurant.id}
      timezone={detail.restaurant.timezone}
      subscription={detail.subscription}
      plans={plans}
      enabledModules={detail.enabledModules}
      readOnly={readOnly}
    />
  );
}

function LimitRow({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const tone = !limit ? "bg-brand-300" : pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-brand-500";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="tabular text-muted">
          <span className="font-semibold text-ink">{formatNumber(used)}</span> {limit ? `of ${formatNumber(limit)}` : "· unlimited"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={limit ?? undefined}>
        <div className={cn("h-full rounded-full", tone)} style={{ width: limit ? `${Math.max(pct, used ? 2 : 0)}%` : "100%", opacity: limit ? 1 : 0.35 }} />
      </div>
    </div>
  );
}

async function UsageTab({ detail }: { detail: RestaurantAdmin }) {
  const trading = await getRestaurantTrading(detail.restaurant.id);
  const plan = detail.subscription?.plan;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Plan limits" description={plan ? `${plan.name} plan` : "No plan"} />
          <CardBody className="space-y-4">
            <LimitRow label="User seats" used={detail.counts.users} limit={plan?.maxUsers} />
            <LimitRow label="Tables" used={detail.counts.tables} limit={plan?.maxTables} />
            <LimitRow label="Menu items" used={detail.counts.products} limit={plan?.maxProducts} />
            <LimitRow label="Locations" used={1} limit={plan?.maxLocations} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Daily orders" description="Completed orders · last 30 days" />
          <CardBody>
            <ColumnChart data={trading.trend} xKey="label" yKey="orders" label="Orders" kind="number" />
          </CardBody>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Order channels" description="Completed orders by source · last 30 days" />
          <CardBody>
            <RankedBars
              kind="number"
              rows={trading.bySource.map((s) => ({
                key: s.source,
                label: ORDER_SOURCE_LABEL[s.source] ?? s.source,
                value: s.orders,
                sub: formatMoney(s.gmv, { decimals: "auto" }),
              }))}
              emptyLabel="No completed orders in the last 30 days"
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Footprint" />
          <CardBody>
            <DetailList
              items={[
                { label: "Lifetime orders", value: formatNumber(detail.counts.orders) },
                { label: "Lifetime sales", value: formatMoney(trading.lifetimeGmv, { decimals: "auto" }) },
                { label: "Customers", value: formatNumber(detail.counts.customers) },
                { label: "Active API keys", value: formatNumber(detail.counts.apiKeys) },
                { label: "Enabled modules", value: `${detail.enabledModules.length} of ${Object.keys(MODULE_CATALOG).length}` },
                { label: "Last order", value: trading.lastOrderAt ? formatRelative(trading.lastOrderAt) : "Never" },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

async function ActivityTab({ detail, sp }: { detail: RestaurantAdmin; sp: SearchParams }) {
  const data = await listAuditLogs(sp, { restaurantId: detail.restaurant.id });
  const filtered = ["q", "category", "actor", "scope"].some((k) => param(sp, k));
  return (
    <TableCard
      toolbar={
        <>
          <SearchParamInput placeholder="Search activity" />
          <FilterSelect param="category" allLabel="All actions" className="w-[150px]" options={data.categories.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))} />
          <FilterSelect
            param="actor"
            allLabel="Anyone"
            className="w-[150px]"
            options={[
              { value: "admins", label: "Platform admins" },
              { value: "system", label: "System" },
            ]}
          />
        </>
      }
    >
      <AuditTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} showRestaurant={false} filtered={filtered} />
    </TableCard>
  );
}

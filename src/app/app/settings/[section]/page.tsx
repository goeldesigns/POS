import { CircleCheck, CircleMinus } from "lucide-react";
import type { Metadata } from "next";
import { headers, cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RolesSettings, UsersSettings } from "@/components/settings/access-settings";
import { ApiKeys, CouponsSettings, SessionsCard, TaxRates } from "@/components/settings/misc-settings";
import { SectionForm } from "@/components/settings/section-form";
import { Badge, Card, CardBody, CardHeader, DetailList, StatusBadge } from "@/components/ui/display";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { SUBSCRIPTION_STATUS } from "@/lib/labels";
import { MODULE_CATALOG, MODULE_KEYS, PLAN_FLAGS } from "@/lib/permissions/catalog";
import { isSettingsSection, RESTAURANT_FIELD_SECTIONS } from "@/lib/validation/settings";
import { prisma } from "@/server/db";
import { hashToken } from "@/server/crypto";
import { requirePagePermission } from "@/server/auth/guards";
import { SESSION_COOKIE } from "@/server/auth/session";
import { listMembers, listRoles } from "@/server/services/members";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const ctx = await requirePagePermission("settings.view");
  const { section } = await params;
  const canEdit = ctx.permissions.has("settings.edit");

  if (isSettingsSection(section)) {
    const values = RESTAURANT_FIELD_SECTIONS.includes(section)
      ? await prisma.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } })
      : await ctx.db.restaurantSettings.findUniqueOrThrow({ where: { restaurantId: ctx.restaurantId } });
    const form = <SectionForm section={section} values={values as unknown as Record<string, unknown>} canEdit={canEdit} />;
    if (section === "tax") {
      const rates = await ctx.db.taxRate.findMany({ orderBy: { rate: "asc" }, include: { _count: { select: { products: true } } } });
      return (
        <>
          {form}
          <TaxRates rows={rates.map((t) => ({ id: t.id, name: t.name, rate: t.rate, isDefault: t.isDefault, isActive: t.isActive, products: t._count.products }))} />
        </>
      );
    }
    if (section === "security") {
      const token = (await cookies()).get(SESSION_COOKIE.RESTAURANT)?.value;
      const sessions = await prisma.session.findMany({ where: { userId: ctx.user.id, scope: "RESTAURANT", expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 20 });
      const logs = await ctx.db.auditLog.findMany({ where: { action: { in: ["user.login", "member.password_reset", "member.permissions_updated", "member.created", "member.removed", "settings.updated", "apikey.created", "apikey.revoked"] } }, orderBy: { createdAt: "desc" }, take: 25 });
      return (
        <>
          {form}
          <SessionsCard sessions={sessions.map((s) => ({ id: s.id, userAgent: s.userAgent, ipAddress: s.ipAddress, lastSeenAt: s.lastSeenAt.toISOString(), current: !!token && s.tokenHash === hashToken(token) }))} />
          <Card className="mt-4">
            <CardHeader title="Security log" description="Sign-ins and access changes in this restaurant" />
            <CardBody>
              <ul className="space-y-2.5">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-4 text-[13px]">
                    <span className="text-ink">{l.summary}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDateTime(l.createdAt, ctx.restaurant.timezone)}{l.ipAddress ? ` · ${l.ipAddress}` : ""}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </>
      );
    }
    return form;
  }

  switch (section) {
    case "users": {
      const [members, roles] = await Promise.all([listMembers(ctx), listRoles(ctx)]);
      return (
        <UsersSettings
          enabledModules={[...ctx.modules]}
          roles={roles.map((r) => ({ id: r.id, name: r.name, description: r.description, isOwner: r.isOwner, isSystem: r.isSystem, members: r._count.members, permissions: r.permissions.map((p) => p.permissionKey) }))}
          members={members.map((m) => ({
            id: m.id,
            userId: m.userId,
            name: m.user.name,
            email: m.user.email,
            phone: m.user.phone,
            status: m.status,
            lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
            role: m.role,
            overrides: m.permissions as { permissionKey: string; effect: "GRANT" | "DENY" }[],
          }))}
        />
      );
    }
    case "roles": {
      const roles = await listRoles(ctx);
      return (
        <RolesSettings
          enabledModules={[...ctx.modules]}
          customRolesAllowed={!ctx.plan || ctx.plan.flags.has("custom_roles")}
          roles={roles.map((r) => ({ id: r.id, name: r.name, description: r.description, isOwner: r.isOwner, isSystem: r.isSystem, members: r._count.members, permissions: r.permissions.map((p) => p.permissionKey) }))}
        />
      );
    }
    case "coupons": {
      const coupons = await ctx.db.coupon.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
      return (
        <CouponsSettings
          rows={coupons.map((c) => ({
            id: c.id,
            code: c.code,
            description: c.description,
            type: c.type,
            value: c.value,
            minOrder: c.minOrder,
            maxDiscount: c.maxDiscount,
            validFrom: c.validFrom?.toISOString() ?? null,
            validTo: c.validTo?.toISOString() ?? null,
            usageLimit: c.usageLimit,
            usedCount: c.usedCount,
            isActive: c.isActive,
          }))}
        />
      );
    }
    case "integrations": {
      const keys = await ctx.db.apiKey.findMany({ orderBy: { createdAt: "desc" } });
      const h = await headers();
      const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
      return (
        <div className="space-y-4">
          <ApiKeys
            allowed={!!ctx.plan?.flags.has("api_access")}
            baseUrl={base}
            rows={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }))}
          />
          <Card className="p-5 text-[13px]">
            <p className="font-semibold text-ink">Aggregators</p>
            <p className="mt-1 text-muted">
              Swiggy and Zomato connections live on the{" "}
              {ctx.permissions.has("swiggy.view") || ctx.permissions.has("zomato.view") ? (
                <Link href="/app/integrations" className="font-medium text-brand-500">Swiggy & Zomato</Link>
              ) : (
                "Swiggy & Zomato"
              )}{" "}
              page{ctx.modules.has("swiggy") || ctx.modules.has("zomato") ? "." : " — not enabled on your plan."}
            </p>
          </Card>
        </div>
      );
    }
    case "subscription": {
      const sub = await ctx.db.subscription.findFirst({ include: { plan: { include: { features: true } } } });
      const [users, tables, products] = await Promise.all([ctx.db.restaurantUser.count(), ctx.db.diningTable.count(), ctx.db.product.count({ where: { deletedAt: null } })]);
      if (!sub) return <Card className="p-6 text-[13px] text-muted">No subscription on file. Contact Tabla support.</Card>;
      const usage = [
        { label: "Users", used: users, limit: sub.plan.maxUsers },
        { label: "Tables", used: tables, limit: sub.plan.maxTables },
        { label: "Menu items", used: products, limit: sub.plan.maxProducts },
      ];
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader title={`${sub.plan.name} plan`} description={sub.plan.description ?? undefined} actions={<StatusBadge dict={SUBSCRIPTION_STATUS} value={sub.status} />} />
            <CardBody>
              <DetailList
                items={[
                  { label: "Price", value: `${formatMoney(sub.priceOverride ?? (sub.billingInterval === "YEARLY" ? sub.plan.priceYearly : sub.plan.priceMonthly))} / ${sub.billingInterval === "YEARLY" ? "year" : "month"}` },
                  { label: "Current period", value: `${formatDate(sub.currentPeriodStart, "UTC")} – ${formatDate(sub.currentPeriodEnd, "UTC")}` },
                  { label: sub.status === "TRIALING" ? "Trial ends" : "Renews", value: formatDate(sub.trialEndsAt ?? sub.currentPeriodEnd, "UTC") },
                  { label: "Billing", value: sub.provider ? sub.provider : "Invoiced by Tabla" },
                ]}
              />
              <p className="mt-4 text-xs text-muted">To change plan or billing details, contact support@tabla.dev. Online billing (Razorpay/Stripe) is on the roadmap.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Usage" />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              {usage.map((u) => (
                <div key={u.label}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="text-muted">{u.label}</span>
                    <span className="font-medium text-ink">{u.used}{u.limit ? ` / ${u.limit}` : " · unlimited"}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-brand-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${u.limit ? Math.min(100, (u.used / u.limit) * 100) : 8}%` }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Included modules & features" description="Modules can also be switched on or off by Tabla for your account." />
            <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {MODULE_KEYS.map((m) => (
                <p key={m} className="flex items-center gap-2 text-[13px]">
                  {ctx.modules.has(m) ? <CircleCheck className="size-4 text-success" /> : <CircleMinus className="size-4 text-subtle" />}
                  <span className={ctx.modules.has(m) ? "text-ink" : "text-subtle"}>{MODULE_CATALOG[m].label}</span>
                </p>
              ))}
              {(Object.keys(PLAN_FLAGS) as (keyof typeof PLAN_FLAGS)[]).map((f) => (
                <p key={f} className="flex items-center gap-2 text-[13px]">
                  {ctx.plan?.flags.has(f) ? <CircleCheck className="size-4 text-success" /> : <CircleMinus className="size-4 text-subtle" />}
                  <span className={ctx.plan?.flags.has(f) ? "text-ink" : "text-subtle"}>{PLAN_FLAGS[f]}</span>
                  <Badge size="sm">Feature</Badge>
                </p>
              ))}
            </CardBody>
          </Card>
        </div>
      );
    }
    default:
      notFound();
  }
}

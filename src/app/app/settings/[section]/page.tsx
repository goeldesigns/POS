import { CircleCheck, CircleMinus } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RolesSettings, UsersSettings } from "@/components/settings/access-settings";
import { ApiKeys, CouponsSettings, SessionsCard, TaxRates } from "@/components/settings/misc-settings";
import { SectionForm } from "@/components/settings/section-form";
import { Badge, Card, CardBody, CardHeader, DetailList, StatusBadge } from "@/components/ui/display";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { SUBSCRIPTION_STATUS } from "@/lib/labels";
import { MODULE_CATALOG, MODULE_KEYS, PLAN_FLAGS } from "@/lib/permissions/catalog";
import { isSettingsSection } from "@/lib/validation/settings";
import { requirePagePermission } from "@/server/auth/guards";
import { customRolesAllowed, listMembers, listRoles } from "@/server/services/members";
import { getSettingsValues, getSubscription, listApiKeys, listCoupons, listSessions, listTaxRates, securityLog } from "@/server/services/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const ctx = await requirePagePermission("settings.view");
  const { section } = await params;
  const canEdit = ctx.permissions.has("settings.edit");

  if (isSettingsSection(section)) {
    const values = await getSettingsValues(ctx, section);
    const form = <SectionForm section={section} values={values} canEdit={canEdit} />;
    if (section === "tax") {
      const rates = await listTaxRates(ctx);
      return (
        <>
          {form}
          <TaxRates rows={rates} />
        </>
      );
    }
    if (section === "security") {
      const [sessions, logs] = await Promise.all([listSessions(ctx), securityLog(ctx)]);
      return (
        <>
          {form}
          <SessionsCard sessions={sessions} />
          <Card className="mt-4">
            <CardHeader title="Security log" description="Sign-ins and access changes in this restaurant" />
            <CardBody>
              <ul className="space-y-2.5">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-4 text-[13px]">
                    <span className="text-ink">{l.summary}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDateTime(new Date(l.createdAt), ctx.restaurant.timezone)}{l.ipAddress ? ` · ${l.ipAddress}` : ""}</span>
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
      return <UsersSettings enabledModules={[...ctx.modules]} roles={roles} members={members} />;
    }
    case "roles": {
      const [roles, customAllowed] = await Promise.all([listRoles(ctx), customRolesAllowed(ctx)]);
      return <RolesSettings enabledModules={[...ctx.modules]} customRolesAllowed={!ctx.plan || customAllowed} roles={roles} />;
    }
    case "coupons": {
      const coupons = await listCoupons(ctx);
      return <CouponsSettings rows={coupons} />;
    }
    case "integrations": {
      const keys = await listApiKeys(ctx);
      const h = await headers();
      const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
      return (
        <div className="space-y-4">
          <ApiKeys
            allowed={!!ctx.plan?.flags.has("api_access")}
            baseUrl={base}
            rows={keys.rows}
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
      const sub = await getSubscription(ctx).catch(() => null);
      if (!sub) return <Card className="p-6 text-[13px] text-muted">No subscription on file. Contact Tabla support.</Card>;
      const usage = sub.usage;
      return (
        <div className="space-y-4">
          <Card>
            <CardHeader title={`${sub.plan} plan`} description={sub.description ?? undefined} actions={<StatusBadge dict={SUBSCRIPTION_STATUS} value={sub.status} />} />
            <CardBody>
              <DetailList
                items={[
                  { label: "Price", value: `${formatMoney(sub.price)} / ${sub.billingInterval === "YEARLY" ? "year" : "month"}` },
                  { label: "Current period", value: `${formatDate(new Date(sub.currentPeriodStart), "UTC")} – ${formatDate(new Date(sub.currentPeriodEnd), "UTC")}` },
                  { label: sub.status === "TRIALING" ? "Trial ends" : "Renews", value: formatDate(new Date(sub.trialEndsAt ?? sub.currentPeriodEnd), "UTC") },
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
                <div key={u.key}>
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

"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { CheckboxField, SelectField, TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, InlineAlert, StatusBadge } from "@/components/ui/display";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDate, formatMoney } from "@/lib/format";
import { SUBSCRIPTION_STATUS } from "@/lib/labels";
import { CORE_MODULES, MODULE_CATALOG, isModuleKey } from "@/lib/permissions/catalog";
import { changeSubscriptionSchema } from "@/lib/validation/platform";
import { changeSubscriptionAction } from "@/server/actions/platform";
import type { AdminPlan, RestaurantAdmin } from "@/server/services/platform";

function ymd(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function SubscriptionPanel({
  restaurantId,
  timezone,
  subscription,
  plans,
  enabledModules,
  readOnly,
}: {
  restaurantId: string;
  timezone: string;
  subscription: RestaurantAdmin["subscription"];
  plans: AdminPlan[];
  enabledModules: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const defaultEnd = subscription ? ymd(subscription.currentPeriodEnd, timezone) : ymd(new Date(Date.now() + 30 * 86_400_000).toISOString(), timezone);
  const form = useZodForm(changeSubscriptionSchema, {
    restaurantId,
    planKey: subscription?.plan.key ?? plans.find((p) => p.isActive)?.key ?? "",
    status: subscription?.status ?? "ACTIVE",
    billingInterval: subscription?.billingInterval ?? "MONTHLY",
    periodEnd: defaultEnd,
    applyPlanModules: false,
  });
  const planKey = form.watch("planKey");
  const interval = form.watch("billingInterval");
  const applyModules = form.watch("applyPlanModules");
  const plan = plans.find((p) => p.key === planKey);
  const planModuleSet = new Set<string>((plan?.features ?? []).filter(isModuleKey));
  const willLose = applyModules ? enabledModules.filter((m) => !planModuleSet.has(m) && !(CORE_MODULES as readonly string[]).includes(m)) : [];

  const submit = useFormSubmit(form, changeSubscriptionAction, {
    success: "Subscription updated",
    onSuccess: (r) => {
      for (const w of r.warnings) toast.warning(w);
      form.reset({ ...form.getValues(), applyPlanModules: false });
      router.refresh();
    },
  });

  const extendBy = (days: number) => {
    const base = new Date(`${form.getValues("periodEnd")}T12:00:00Z`);
    const from = Number.isNaN(base.getTime()) ? new Date() : base;
    form.setValue("periodEnd", new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10), { shouldDirty: true });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader title="Change subscription" description="Billing providers (Stripe, Razorpay) will drive these fields later; for now they're managed here." />
        <CardBody>
          <form onSubmit={submit} noValidate className="space-y-5">
            <fieldset disabled={readOnly} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  control={form.control}
                  name="planKey"
                  label="Plan"
                  options={plans
                    .filter((p) => p.isActive || p.key === subscription?.plan.key)
                    .map((p) => ({ value: p.key, label: `${p.name} — ${formatMoney(p.priceMonthly, { decimals: "auto" })}/mo${p.isActive ? "" : " (retired)"}` }))}
                />
                <SelectField
                  control={form.control}
                  name="status"
                  label="Status"
                  options={[
                    { value: "TRIALING", label: "Trial" },
                    { value: "ACTIVE", label: "Active (paying)" },
                    { value: "PAST_DUE", label: "Past due" },
                    { value: "CANCELLED", label: "Cancelled" },
                    { value: "EXPIRED", label: "Expired" },
                  ]}
                />
                <SelectField
                  control={form.control}
                  name="billingInterval"
                  label="Billing interval"
                  options={[
                    { value: "MONTHLY", label: "Monthly" },
                    { value: "YEARLY", label: "Yearly" },
                  ]}
                />
                <div>
                  <TextField control={form.control} name="periodEnd" label="Current period ends" type="date" />
                  <div className="mt-1.5 flex gap-1.5">
                    {[
                      { label: "+14 days", days: 14 },
                      { label: "+1 month", days: 30 },
                      { label: "+1 year", days: 365 },
                    ].map((x) => (
                      <button
                        suppressHydrationWarning
                        key={x.label}
                        type="button"
                        onClick={() => extendBy(x.days)}
                        className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-2 hover:bg-canvas"
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <CheckboxField control={form.control} name="applyPlanModules" label={`Also reset modules to what ${plan?.name ?? "the plan"} includes`} />
              {willLose.length ? (
                <InlineAlert tone="warning" title="These modules will be switched off">
                  {willLose.map((m) => MODULE_CATALOG[m as keyof typeof MODULE_CATALOG]?.label ?? m).join(", ")}. Their data is kept and comes back if you switch them on again.
                </InlineAlert>
              ) : null}
              {plan ? (
                <p className="text-xs text-muted">
                  {plan.name} costs {formatMoney(interval === "YEARLY" ? plan.priceYearly : plan.priceMonthly, { decimals: "auto" })} per{" "}
                  {interval === "YEARLY" ? "year" : "month"} · {plan.maxUsers ? `${plan.maxUsers} users` : "unlimited users"} ·{" "}
                  {plan.maxTables ? `${plan.maxTables} tables` : "unlimited tables"} · {plan.maxProducts ? `${plan.maxProducts} menu items` : "unlimited menu items"}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button type="button" variant="outline" disabled={!form.formState.isDirty} onClick={() => form.reset()}>
                  Discard
                </Button>
                <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
                  Update subscription
                </Button>
              </div>
            </fieldset>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Current subscription" />
        <CardBody>
          {subscription ? (
            <dl className="divide-y divide-line text-[13px]">
              {[
                ["Plan", <span key="p" className="font-semibold">{subscription.plan.name}</span>],
                ["Status", <StatusBadge key="s" dict={SUBSCRIPTION_STATUS} value={subscription.status} size="sm" />],
                ["Billing", subscription.billingInterval === "YEARLY" ? "Yearly" : "Monthly"],
                [
                  "Price",
                  subscription.priceOverride != null
                    ? `${formatMoney(subscription.priceOverride, { decimals: "auto" })} (custom)`
                    : formatMoney(subscription.billingInterval === "YEARLY" ? subscription.plan.priceYearly : subscription.plan.priceMonthly, { decimals: "auto" }),
                ],
                ["Monthly value", formatMoney(subscription.monthlyValue, { decimals: "auto" })],
                ["Period started", formatDate(subscription.currentPeriodStart, PLATFORM_TZ)],
                [subscription.status === "TRIALING" ? "Trial ends" : "Renews / ends", formatDate(subscription.currentPeriodEnd, PLATFORM_TZ)],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-muted">This restaurant has no subscription yet. Choose a plan to create one.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

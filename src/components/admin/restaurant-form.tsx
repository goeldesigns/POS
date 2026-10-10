"use client";

import { Check, Dices, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { SelectField, SwitchField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Badge, Card } from "@/components/ui/display";
import { FormGrid, FormSection } from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import { CORE_MODULES, MODULE_CATALOG, MODULE_KEYS, type ModuleKey } from "@/lib/permissions/catalog";
import { cn, pluralize } from "@/lib/utils";
import {
  CURRENCIES,
  RESTAURANT_TYPES,
  TIMEZONES,
  createRestaurantSchema,
  updateRestaurantSchema,
} from "@/lib/validation/platform";
import { createRestaurantAction, updateRestaurantAction } from "@/server/actions/platform";

export interface PlanOption {
  key: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  trialDays: number;
  maxUsers: number | null;
  maxTables: number | null;
  modules: string[];
}

const ORDER_TYPES = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "ONLINE", label: "Online" },
];

function generatePassword() {
  const words = ["Masala", "Tandoor", "Paneer", "Biryani", "Chutney", "Kulfi", "Lassi", "Dosa"];
  const bytes = new Uint32Array(3);
  crypto.getRandomValues(bytes);
  return `${words[bytes[0]! % words.length]}@${1000 + (bytes[1]! % 9000)}${String.fromCharCode(97 + (bytes[2]! % 26))}`;
}

function ProfileFields({ control }: { control: never }) {
  return (
    <>
      <FormSection title="Business" description="How the restaurant appears on receipts, reports and in the console.">
        <FormGrid>
          <TextField control={control} name="name" label="Restaurant name" required placeholder="e.g. Spice & Stone" />
          <TextField control={control} name="legalName" label="Legal entity name" optional placeholder="e.g. Spice & Stone Hospitality Pvt Ltd" />
          <SelectField control={control} name="restaurantType" label="Restaurant type" options={RESTAURANT_TYPES.map((t) => ({ value: t, label: t }))} />
          <TextField control={control} name="ownerName" label="Owner name" required />
          <TextField control={control} name="email" label="Business email" required type="email" />
          <TextField control={control} name="phone" label="Phone" required inputMode="tel" placeholder="+91 98450 12345" />
        </FormGrid>
      </FormSection>
      <FormSection title="Location & compliance" description="Used for tax invoices. GSTIN and FSSAI can be added later.">
        <FormGrid>
          <TextField control={control} name="addressLine" label="Address" optional className="sm:col-span-2" />
          <TextField control={control} name="city" label="City" optional />
          <TextField control={control} name="state" label="State" optional />
          <TextField control={control} name="postalCode" label="PIN code" optional inputMode="numeric" />
          <TextField control={control} name="country" label="Country" required />
          <TextField control={control} name="gstNumber" label="GSTIN" optional placeholder="29ABCDE1234F1Z5" />
          <TextField control={control} name="fssaiNumber" label="FSSAI licence" optional inputMode="numeric" />
          <SelectField control={control} name="currency" label="Currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <SelectField control={control} name="timezone" label="Timezone" options={TIMEZONES.map((t) => ({ value: t, label: t.replace("_", " ") }))} />
        </FormGrid>
      </FormSection>
    </>
  );
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface RestaurantPrefill {
  demoRequestId: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string | null;
  restaurantType: string | null;
}

export function CreateRestaurantForm({ plans, defaultPlanKey, prefill }: { plans: PlanOption[]; defaultPlanKey: string; prefill?: RestaurantPrefill | null }) {
  const router = useRouter();
  const initialPlan = plans.find((p) => p.key === defaultPlanKey) ?? plans[0];
  const prefillType = RESTAURANT_TYPES.find((t) => t === prefill?.restaurantType);
  const form = useZodForm(createRestaurantSchema, {
    name: prefill?.name ?? "",
    legalName: "",
    ownerName: prefill?.ownerName ?? "",
    email: prefill?.email ?? "",
    phone: prefill?.phone ?? "",
    addressLine: "",
    city: prefill?.city ?? "",
    state: "",
    country: "India",
    postalCode: "",
    gstNumber: "",
    fssaiNumber: "",
    currency: "INR",
    timezone: "Asia/Kolkata",
    restaurantType: prefillType ?? "Casual Dining",
    numberOfTables: "10",
    taxRate: "5",
    taxInclusive: false,
    serviceChargePercent: "0",
    defaultOrderType: "DINE_IN",
    receiptHeader: "",
    receiptFooter: "Thank you for dining with us!",
    planKey: initialPlan?.key ?? "",
    modules: initialPlan?.modules ?? [...CORE_MODULES],
    loginEmail: prefill?.email ?? "",
    password: "",
    confirmPassword: "",
    demoRequestId: prefill?.demoRequestId ?? null,
  });
  const control = form.control as never;
  const planKey = form.watch("planKey");
  const modules = new Set(form.watch("modules") ?? []);
  const plan = plans.find((p) => p.key === planKey);
  const planModules = new Set(plan?.modules ?? []);
  const email = form.watch("email");
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    if (!form.getFieldState("loginEmail").isDirty) form.setValue("loginEmail", email ?? "");
  }, [email, form]);

  const choosePlan = (key: string) => {
    form.setValue("planKey", key, { shouldDirty: true });
    form.setValue("modules", plans.find((p) => p.key === key)?.modules ?? [...CORE_MODULES]);
  };
  const toggleModule = (m: ModuleKey, on: boolean) => {
    const next = new Set(modules);
    if (on) next.add(m);
    else next.delete(m);
    form.setValue("modules", MODULE_KEYS.filter((k) => next.has(k)), { shouldDirty: true });
  };

  const submit = useFormSubmit(form, createRestaurantAction, {
    success: "Restaurant created — share the owner login privately",
    onSuccess: (r) => router.push(`/super-admin/restaurants/${r.id}?created=1`),
  });

  const groups = [...new Set(MODULE_KEYS.map((m) => MODULE_CATALOG[m].group))];
  const extras = [...modules].filter((m) => !planModules.has(m));

  return (
    <form onSubmit={submit} noValidate>
      <Card className="px-5 sm:px-6">
        <ProfileFields control={control} />

        <FormSection title="Operations" description="Starting setup. The owner can change all of this later in Settings.">
          <FormGrid>
            <TextField control={control} name="numberOfTables" label="Number of tables" inputMode="numeric" description="Created on a “Main Hall” floor" />
            <SelectField control={control} name="defaultOrderType" label="Default order type" options={ORDER_TYPES} />
            <TextField control={control} name="taxRate" label="GST rate" inputMode="decimal" suffix="%" />
            <TextField control={control} name="serviceChargePercent" label="Service charge" inputMode="decimal" suffix="%" />
            <div className="sm:col-span-2">
              <SwitchField control={control} name="taxInclusive" label="Menu prices include tax" description="When on, GST is extracted from item prices instead of added on top." />
            </div>
            <TextareaField control={control} name="receiptHeader" label="Receipt header" optional rows={2} />
            <TextareaField control={control} name="receiptFooter" label="Receipt footer" optional rows={2} />
          </FormGrid>
        </FormSection>

        <FormSection title="Plan & modules" description="The plan sets limits and the default modules. You can switch extra modules on or off for this restaurant.">
          <div className="space-y-5">
            <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {plans.map((p) => {
                const active = p.key === planKey;
                return (
                  <button
                    suppressHydrationWarning
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choosePlan(p.key)}
                    className={cn(
                      "relative rounded-xl border p-4 text-left transition-colors",
                      active ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line hover:border-line-strong",
                    )}
                  >
                    {active ? (
                      <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-brand-500 text-white">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : null}
                    <p className="text-sm font-semibold text-ink">{p.name}</p>
                    <p className="mt-0.5 text-[13px] text-ink-2">
                      <span className="font-semibold">{formatMoney(p.priceMonthly, { decimals: "auto" })}</span>
                      <span className="text-muted"> / month</span>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      {p.maxUsers ? `${p.maxUsers} users` : "Unlimited users"} · {p.maxTables ? `${p.maxTables} tables` : "unlimited tables"} ·{" "}
                      {pluralize(p.modules.length, "module")}{p.trialDays ? ` · ${p.trialDays}-day trial` : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-[13px] font-medium text-ink">
                  Modules <span className="text-muted">· {modules.size} on</span>
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={() => choosePlan(planKey)}>
                  Reset to plan
                </Button>
              </div>
              <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="mb-2 text-2xs font-semibold tracking-wide text-subtle uppercase">{g}</p>
                    <div className="space-y-2">
                      {MODULE_KEYS.filter((m) => MODULE_CATALOG[m].group === g).map((m) => {
                        const core = CORE_MODULES.includes(m);
                        return (
                          <label key={m} className={cn("flex items-center gap-2.5 text-[13px]", core ? "text-muted" : "cursor-pointer text-ink-2")}>
                            <Checkbox checked={core || modules.has(m)} disabled={core} onCheckedChange={(v) => toggleModule(m, v === true)} />
                            {MODULE_CATALOG[m].label}
                            {core ? <Lock className="size-3 text-subtle" aria-label="Always on" /> : null}
                            {!core && modules.has(m) && !planModules.has(m) ? (
                              <Badge size="sm" tone="warning">
                                Extra
                              </Badge>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {extras.length ? (
                <p className="border-t border-line px-4 py-2.5 text-xs text-warning-700">
                  {extras.length} module{extras.length > 1 ? "s are" : " is"} outside the {plan?.name} plan and will be enabled as an override.
                </p>
              ) : null}
            </div>
          </div>
        </FormSection>

        <FormSection title="Owner login" description="The owner signs in with these details and can add the rest of the team. Share the password privately.">
          <FormGrid>
            <TextField control={control} name="loginEmail" label="Login email" required type="email" className="sm:col-span-2" />
            <TextField
              control={control}
              name="password"
              label="Temporary password"
              required
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              description="8+ characters with a letter and a number"
            />
            <TextField control={control} name="confirmPassword" label="Confirm password" required type={showPassword ? "text" : "password"} autoComplete="new-password" />
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const pw = generatePassword();
                  form.setValue("password", pw, { shouldValidate: true });
                  form.setValue("confirmPassword", pw, { shouldValidate: true });
                  setShowPassword(true);
                }}
              >
                <Dices /> Generate password
              </Button>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                <Checkbox checked={showPassword} onCheckedChange={(v) => setShowPassword(v === true)} />
                Show password
              </label>
            </div>
          </FormGrid>
        </FormSection>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-end gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-surface/95">
        <p className="mr-auto hidden text-xs text-muted sm:block">
          Creates the restaurant, default roles, owner login, {form.watch("numberOfTables") || 0} tables and a{" "}
          {plan?.trialDays ? `${plan.trialDays}-day trial` : "subscription"} in one step.
        </p>
        <Button variant="outline" asChild>
          <Link href="/super-admin/restaurants">Cancel</Link>
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Create restaurant
        </Button>
      </div>
    </form>
  );
}

// ─── Edit profile ───────────────────────────────────────────────────────────

export interface RestaurantProfileValue {
  id: string;
  name: string;
  legalName: string | null;
  ownerName: string;
  email: string;
  phone: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
  gstNumber: string | null;
  fssaiNumber: string | null;
  currency: string;
  timezone: string;
  restaurantType: string;
}

export function RestaurantProfileForm({ value, disabled }: { value: RestaurantProfileValue; disabled?: boolean }) {
  const router = useRouter();
  const defaults = {
    ...value,
    legalName: value.legalName ?? "",
    addressLine: value.addressLine ?? "",
    city: value.city ?? "",
    state: value.state ?? "",
    postalCode: value.postalCode ?? "",
    gstNumber: value.gstNumber ?? "",
    fssaiNumber: value.fssaiNumber ?? "",
  } as never;
  const form = useZodForm(updateRestaurantSchema, defaults);
  const submit = useFormSubmit(form, updateRestaurantAction, {
    success: "Restaurant details saved",
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={disabled} className="contents">
        <ProfileFields control={form.control as never} />
      </fieldset>
      <div className="flex items-center justify-end gap-2 border-t border-line py-4">
        {form.formState.isDirty ? <p className="mr-auto text-xs text-muted">Unsaved changes</p> : null}
        <Button type="button" variant="outline" disabled={!form.formState.isDirty} onClick={() => form.reset(defaults)}>
          Discard
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting} disabled={disabled || !form.formState.isDirty}>
          Save details
        </Button>
      </div>
    </form>
  );
}


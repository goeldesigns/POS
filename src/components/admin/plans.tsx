"use client";

import { Check, Ellipsis, Lock, Pencil, Plus, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { MoneyField, SwitchField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Badge, Card } from "@/components/ui/display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney, formatNumber } from "@/lib/format";
import { CORE_MODULES, MODULE_CATALOG, MODULE_KEYS, PLAN_FLAGS, isModuleKey, type PlanFlag } from "@/lib/permissions/catalog";
import { cn, pluralize } from "@/lib/utils";
import { planSchema } from "@/lib/validation/platform";
import { deletePlanAction, savePlanAction } from "@/server/actions/platform";
import type { AdminPlan } from "@/server/services/platform";

const limit = (n: number | null, noun: string) => (n ? `${formatNumber(n)} ${n === 1 ? noun.replace(/s$/, "") : noun}` : `Unlimited ${noun}`);

export function PlansBoard({ plans, defaultPlanKey }: { plans: AdminPlan[]; defaultPlanKey: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<AdminPlan | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<AdminPlan | null>(null);
  const del = useAction(deletePlanAction, {
    success: "Plan deleted",
    onSuccess: () => {
      setDeleting(null);
      router.refresh();
    },
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus /> New plan
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {plans.map((p) => {
          const modules = p.features.filter(isModuleKey);
          const flags = p.features.filter((f): f is PlanFlag => f in PLAN_FLAGS);
          return (
            <Card key={p.id} className={cn("flex flex-col", !p.isActive && "opacity-75")}>
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
                    {p.key === defaultPlanKey ? <Badge size="sm" tone="brand">Default</Badge> : null}
                    {!p.isActive ? <Badge size="sm">Retired</Badge> : !p.isPublic ? <Badge size="sm" tone="warning">Hidden</Badge> : null}
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-subtle">{p.key}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label={`${p.name} actions`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[180px]">
                    <DropdownMenuItem onSelect={() => setEditing(p)}>
                      <Pencil /> Edit plan
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem tone="danger" disabled={p.subscribers > 0 || p.key === defaultPlanKey} onSelect={() => setDeleting(p)}>
                      <Trash /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="px-5 pt-3">
                <p className="text-[22px] font-semibold tracking-[-0.01em] text-ink tabular">
                  {formatMoney(p.priceMonthly, { decimals: "auto" })}
                  <span className="text-[13px] font-normal text-muted"> / month</span>
                </p>
                <p className="text-xs text-muted">
                  {formatMoney(p.priceYearly, { decimals: "auto" })} billed yearly
                  {p.priceMonthly ? ` · saves ${Math.max(0, Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100))}%` : ""}
                  {p.trialDays ? ` · ${p.trialDays}-day trial` : ""}
                </p>
                {p.description ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{p.description}</p> : null}
              </div>
              <dl className="mx-5 mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-center">
                {[
                  ["Restaurants", formatNumber(p.subscribers)],
                  ["Paying", formatNumber(p.activeSubscribers)],
                  ["MRR", formatMoney(p.mrr, { decimals: "auto" })],
                ].map(([label, value]) => (
                  <div key={label} className="px-2 py-2.5">
                    <dt className="text-2xs text-muted">{label}</dt>
                    <dd className="mt-0.5 truncate text-[13px] font-semibold text-ink tabular">{value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-4 space-y-1.5 px-5 text-[13px] text-ink-2">
                <li>{limit(p.maxUsers, "users")}</li>
                <li>{limit(p.maxTables, "tables")}</li>
                <li>{limit(p.maxProducts, "menu items")}</li>
                <li>{limit(p.maxLocations, "locations")}</li>
              </ul>
              <div className="mt-4 flex-1 border-t border-line px-5 py-4">
                <p className="mb-2 text-2xs font-semibold tracking-wide text-subtle uppercase">
                  {pluralize(modules.length, "module")}{flags.length ? ` · ${pluralize(flags.length, "feature")}` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {MODULE_KEYS.filter((m) => modules.includes(m) && !CORE_MODULES.includes(m)).map((m) => (
                    <span key={m} className="rounded-md bg-sunken px-1.5 py-0.5 text-xs text-ink-2">
                      {MODULE_CATALOG[m].label}
                    </span>
                  ))}
                  {flags.map((f) => (
                    <span key={f} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                      {PLAN_FLAGS[f]}
                    </span>
                  ))}
                </div>
              </div>
              {p.pastDue || p.trialing ? (
                <p className="rounded-b-[var(--radius-card)] border-t border-line bg-canvas/60 px-5 py-2.5 text-xs text-muted">
                  {p.trialing ? `${p.trialing} on trial` : ""}
                  {p.trialing && p.pastDue ? " · " : ""}
                  {p.pastDue ? <span className="text-danger-700">{p.pastDue} past due</span> : null}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>

      <PlanDialog value={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the ${deleting?.name} plan?`}
        description="No restaurant is on this plan. Deleting it can't be undone — retire it instead if you might need it again."
        confirmLabel="Delete plan"
        loading={del.pending}
        onConfirm={() => deleting && del.execute({ id: deleting.id })}
      />
    </>
  );
}

function PlanDialog({ value, onClose }: { value: AdminPlan | "new" | null; onClose: () => void }) {
  const router = useRouter();
  const isNew = value === "new";
  const plan = value && value !== "new" ? value : null;
  const toMajor = (n: number) => String(n / 100);
  const defaults = {
    id: plan?.id,
    key: plan?.key ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    priceMonthly: plan ? toMajor(plan.priceMonthly) : "",
    priceYearly: plan ? toMajor(plan.priceYearly) : "",
    trialDays: plan ? String(plan.trialDays) : "14",
    maxUsers: plan?.maxUsers != null ? String(plan.maxUsers) : "",
    maxTables: plan?.maxTables != null ? String(plan.maxTables) : "",
    maxProducts: plan?.maxProducts != null ? String(plan.maxProducts) : "",
    maxLocations: plan?.maxLocations != null ? String(plan.maxLocations) : "",
    isActive: plan?.isActive ?? true,
    isPublic: plan?.isPublic ?? true,
    features: plan?.features ?? [...CORE_MODULES, "pos", "orders", "tables", "menu", "customers", "reports"],
  };
  const form = useZodForm(planSchema, defaults as never);
  React.useEffect(() => {
    if (value) form.reset(defaults as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const features = new Set<string>((form.watch("features") as string[] | undefined) ?? []);
  const toggle = (key: string, on: boolean) => {
    const next = new Set(features);
    if (on) next.add(key);
    else next.delete(key);
    form.setValue("features", [...next], { shouldDirty: true });
  };
  const submit = useFormSubmit(form, savePlanAction, {
    success: isNew ? "Plan created" : "Plan saved — existing restaurants keep their current modules",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const groups = [...new Set(MODULE_KEYS.map((m) => MODULE_CATALOG[m].group))];

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? "New plan" : `Edit ${plan?.name}`} description="Prices are in INR. Leave a limit empty for unlimited." size="xl">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Plan name" required autoFocus />
              <TextField control={form.control} name="key" label="Key" required disabled={!isNew} description={isNew ? "Lowercase, used in URLs and the API. Can't be changed later." : "Keys can't be changed."} />
              <TextareaField control={form.control} name="description" label="Description" optional rows={2} className="sm:col-span-2" />
              <MoneyField control={form.control} name="priceMonthly" label="Monthly price" required />
              <MoneyField control={form.control} name="priceYearly" label="Yearly price" required />
              <TextField control={form.control} name="trialDays" label="Trial days" inputMode="numeric" />
              <div />
              <TextField control={form.control} name="maxUsers" label="Max users" inputMode="numeric" placeholder="Unlimited" />
              <TextField control={form.control} name="maxTables" label="Max tables" inputMode="numeric" placeholder="Unlimited" />
              <TextField control={form.control} name="maxProducts" label="Max menu items" inputMode="numeric" placeholder="Unlimited" />
              <TextField control={form.control} name="maxLocations" label="Max locations" inputMode="numeric" placeholder="Unlimited" />
            </div>

            <div className="rounded-xl border border-line">
              <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium text-ink">Included modules</p>
              <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="mb-2 text-2xs font-semibold tracking-wide text-subtle uppercase">{g}</p>
                    <div className="space-y-2">
                      {MODULE_KEYS.filter((m) => MODULE_CATALOG[m].group === g).map((m) => {
                        const core = CORE_MODULES.includes(m);
                        return (
                          <label key={m} className={cn("flex items-center gap-2.5 text-[13px]", core ? "text-muted" : "cursor-pointer text-ink-2")}>
                            <Checkbox checked={core || features.has(m)} disabled={core} onCheckedChange={(v) => toggle(m, v === true)} />
                            {MODULE_CATALOG[m].label}
                            {core ? <Lock className="size-3 text-subtle" aria-label="Always included" /> : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-2xs font-semibold tracking-wide text-subtle uppercase">Features</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(Object.keys(PLAN_FLAGS) as PlanFlag[]).map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
                      <Checkbox checked={features.has(f)} onCheckedChange={(v) => toggle(f, v === true)} />
                      {PLAN_FLAGS[f]}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SwitchField control={form.control} name="isActive" label="Available" description="Retired plans can't be assigned to more restaurants." />
              <SwitchField control={form.control} name="isPublic" label="Public" description="Shown on the pricing page once billing goes live." />
            </div>
            {!isNew ? (
              <p className="flex items-start gap-2 text-xs text-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                Module changes apply to new restaurants. Use “Reset modules to plan” on a restaurant&apos;s Subscription tab to apply them to an existing one.
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {isNew ? "Create plan" : "Save plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

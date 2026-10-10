"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ImageInput } from "@/components/forms/file-upload";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/controls";
import { Card, InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CURRENCIES, RESTAURANT_TYPES, TIMEZONES } from "@/lib/validation/platform";
import type { SettingsSection } from "@/lib/validation/settings";
import { updateSettingsAction } from "@/server/actions/settings";

type FieldDef =
  | { name: string; label: string; type: "text" | "email" | "tel" | "number"; description?: string; suffix?: string; prefix?: string; placeholder?: string; span?: 2 }
  | { name: string; label: string; type: "textarea"; description?: string; span?: 2 }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; description?: string }
  | { name: string; label: string; type: "switch"; description?: string }
  | { name: string; label: string; type: "list"; description?: string; placeholder?: string }
  | { name: string; label: string; type: "image"; description?: string };

const opt = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

export const SECTION_FIELDS: Record<SettingsSection, { title: string; description: string; fields: FieldDef[] }> = {
  profile: {
    title: "Restaurant profile",
    description: "How your restaurant appears on receipts, invoices and the future online menu.",
    fields: [
      { name: "name", label: "Restaurant name", type: "text" },
      { name: "restaurantType", label: "Type", type: "select", options: opt(RESTAURANT_TYPES) },
      { name: "email", label: "Business email", type: "email" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "addressLine", label: "Address", type: "text", span: 2 },
      { name: "city", label: "City", type: "text" },
      { name: "state", label: "State", type: "text" },
      { name: "postalCode", label: "PIN code", type: "text" },
      { name: "country", label: "Country", type: "text" },
      { name: "logoUrl", label: "Logo", type: "image" },
    ],
  },
  business: {
    title: "Business information",
    description: "Registration details printed on tax invoices.",
    fields: [
      { name: "legalName", label: "Legal entity name", type: "text", span: 2 },
      { name: "gstNumber", label: "GSTIN", type: "text", placeholder: "29ABCDE1234F1Z5" },
      { name: "fssaiNumber", label: "FSSAI licence no.", type: "text" },
      { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES), description: "Changing currency doesn't convert existing amounts." },
      { name: "timezone", label: "Timezone", type: "select", options: opt(TIMEZONES), description: "Reports and day boundaries use this timezone." },
    ],
  },
  tax: {
    title: "Tax & charges",
    description: "How tax and service charge are calculated on every bill.",
    fields: [
      { name: "taxInclusive", label: "Menu prices include tax", type: "switch", description: "When on, tax is extracted from item prices instead of added." },
      { name: "roundOffTotals", label: "Round bills to the nearest rupee", type: "switch" },
      { name: "serviceChargePercent", label: "Service charge (dine-in)", type: "number", suffix: "%", description: "Set 0 to disable. Shown as a separate line on the bill." },
    ],
  },
  receipt: {
    title: "Receipt",
    description: "Thermal receipt layout and content.",
    fields: [
      { name: "receiptHeader", label: "Header text", type: "textarea", description: "Printed under your address, e.g. a tagline." },
      { name: "receiptFooter", label: "Footer text", type: "textarea" },
      { name: "receiptShowGstin", label: "Show GSTIN", type: "switch" },
      { name: "receiptShowFssai", label: "Show FSSAI number", type: "switch" },
      { name: "receiptPaperWidth", label: "Paper width", type: "select", options: [{ value: "80", label: "80 mm" }, { value: "58", label: "58 mm" }] },
    ],
  },
  invoice: {
    title: "Invoice & numbering",
    description: "Prefixes for order and invoice numbers. Numbers continue from the last order.",
    fields: [
      { name: "orderPrefix", label: "Order number prefix", type: "text", placeholder: "ORD" },
      { name: "invoicePrefix", label: "Invoice number prefix", type: "text", placeholder: "INV" },
    ],
  },
  payment: {
    title: "Payments",
    description: "Payment methods offered at the POS.",
    fields: [
      { name: "acceptCash", label: "Cash", type: "switch" },
      { name: "acceptCard", label: "Card", type: "switch" },
      { name: "acceptUpi", label: "UPI", type: "switch" },
      { name: "upiId", label: "UPI ID for QR payments", type: "text", placeholder: "yourname@okaxis", description: "A payment QR with the bill amount is shown at checkout." },
    ],
  },
  orders: {
    title: "Order settings",
    description: "Defaults and rules for every new order.",
    fields: [
      {
        name: "defaultOrderType",
        label: "Default order type",
        type: "select",
        options: [
          { value: "DINE_IN", label: "Dine-in" },
          { value: "TAKEAWAY", label: "Takeaway" },
          { value: "DELIVERY", label: "Delivery" },
          { value: "ONLINE", label: "Online" },
        ],
      },
      { name: "requireCustomerForDelivery", label: "Require customer details for delivery", type: "switch" },
      { name: "allowNegativeStock", label: "Allow sales when ingredients run out", type: "switch", description: "When off, completing an order fails if recipe stock is insufficient." },
    ],
  },
  pos: {
    title: "POS settings",
    description: "Counter behaviour.",
    fields: [
      { name: "autoPrintKot", label: "Print KOT automatically", type: "switch", description: "Opens the kitchen ticket when an order is sent to the kitchen." },
      { name: "autoPrintReceipt", label: "Print receipt automatically after payment", type: "switch" },
      { name: "requireManagerForVoid", label: "Only managers can void orders", type: "switch", description: "Enforced through the POS “Void order” permission." },
    ],
  },
  printers: {
    title: "Printers",
    description: "Receipts and KOTs print through the browser's print dialog (thermal printers appear as system printers).",
    fields: [
      { name: "receiptPrinterName", label: "Receipt printer", type: "text", placeholder: "e.g. EPSON TM-T82 (counter)" },
      { name: "kitchenPrinterName", label: "Kitchen printer", type: "text", placeholder: "e.g. TVS RP3160 (kitchen)" },
    ],
  },
  kitchen: {
    title: "Kitchen",
    description: "How orders reach the kitchen, and the stations on kitchen tickets.",
    fields: [
      {
        name: "autoCompleteOnPayment",
        label: "Skip the kitchen board for paid counter orders",
        type: "switch",
        description:
          "Leave off to use the kitchen board: paid orders appear there and close when the kitchen completes them. Turn on only if you don't use a kitchen screen — paid POS orders then close straight away.",
      },
      { name: "kitchenStations", label: "Kitchen stations", type: "list", placeholder: "e.g. Tandoor", description: "Each station prints its own KOT section." },
    ],
  },
  tables: {
    title: "Tables",
    description: "Table turnover behaviour.",
    fields: [{ name: "freeTableAfterPayment", label: "Free the table as soon as the bill is paid", type: "switch", description: "When off, tables move to Cleaning after payment." }],
  },
  reservations: {
    title: "Reservations",
    description: "Booking defaults.",
    fields: [
      { name: "reservationSlotMinutes", label: "Booking slot length", type: "number", suffix: "min" },
      { name: "reservationDurationMinutes", label: "Default table time", type: "number", suffix: "min" },
      { name: "reservationLeadMinutes", label: "Minimum notice", type: "number", suffix: "min" },
    ],
  },
  notifications: {
    title: "Notifications",
    description: "Alerts shown in the bell menu and sent by email.",
    fields: [
      { name: "notifyLowStock", label: "Low-stock alerts", type: "switch" },
      { name: "notifyNewOnlineOrder", label: "New online order alerts", type: "switch" },
      { name: "notifyReservations", label: "Upcoming reservation alerts", type: "switch" },
      { name: "dailySummaryEmail", label: "Daily summary email", type: "email", placeholder: "owner@restaurant.com", description: "Leave empty to turn off." },
    ],
  },
  security: {
    title: "Security",
    description: "Session policy for your team.",
    fields: [{ name: "sessionTimeoutMinutes", label: "Sign out idle POS sessions after", type: "number", suffix: "min" }],
  },
};

export function SectionForm({ section, values, canEdit }: { section: SettingsSection; values: Record<string, unknown>; canEdit: boolean }) {
  const def = SECTION_FIELDS[section];
  const router = useRouter();
  const toForm = (v: Record<string, unknown>) =>
    Object.fromEntries(def.fields.map((f) => [f.name, f.type === "switch" ? !!v[f.name] : f.type === "list" ? ((v[f.name] as string[]) ?? []) : v[f.name] == null ? "" : String(v[f.name])]));
  const form = useForm<Record<string, unknown>>({ defaultValues: toForm(values) });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const submit = form.handleSubmit(async (data) => {
    setErrors({});
    const r = await updateSettingsAction({ section, values: data });
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      toast.error(r.error);
      return;
    }
    toast.success(`${def.title} saved`);
    form.reset(data);
    router.refresh();
  });

  const switches = def.fields.filter((f) => f.type === "switch");
  const others = def.fields.filter((f) => f.type !== "switch");

  return (
    <form onSubmit={submit} noValidate>
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-ink">{def.title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{def.description}</p>
        {!canEdit ? <InlineAlert tone="warning" className="mt-4">You can view these settings. Editing needs the Settings “Edit” permission.</InlineAlert> : null}
        {switches.length ? (
          <div className="mt-5 max-w-[640px] space-y-2 divide-y divide-line">
            {switches.map((f) => (
              <Controller
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => <div className="pt-2 first:pt-0"><SwitchRow label={f.label} description={f.description} checked={!!field.value} onCheckedChange={field.onChange} disabled={!canEdit} /></div>}
              />
            ))}
          </div>
        ) : null}
        {others.length ? (
          <div className="mt-5 grid max-w-[720px] gap-4 sm:grid-cols-2">
            {others.map((f) => (
              <Controller
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <Field
                    label={f.label}
                    description={"description" in f ? f.description : undefined}
                    error={errors[f.name]}
                    className={f.type === "textarea" || f.type === "list" || f.type === "image" || ("span" in f && f.span === 2) ? "sm:col-span-2" : undefined}
                  >
                    {f.type === "select" ? (
                      <NativeSelect value={String(field.value ?? "")} onChange={field.onChange} disabled={!canEdit}>
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : f.type === "textarea" ? (
                      <Textarea value={String(field.value ?? "")} onChange={field.onChange} disabled={!canEdit} className="min-h-[64px]" />
                    ) : f.type === "list" ? (
                      <ListInput value={(field.value as string[]) ?? []} onChange={field.onChange} disabled={!canEdit} placeholder={f.placeholder} />
                    ) : f.type === "image" ? (
                      <ImageInput value={(field.value as string) || null} onChange={(v) => field.onChange(v ?? "")} />
                    ) : (
                      <Input
                        type={f.type === "number" ? "text" : f.type}
                        inputMode={f.type === "number" ? "decimal" : undefined}
                        value={String(field.value ?? "")}
                        onChange={field.onChange}
                        disabled={!canEdit}
                        suffix={f.suffix}
                        prefix={f.prefix}
                        placeholder={f.placeholder}
                        invalid={!!errors[f.name]}
                      />
                    )}
                  </Field>
                )}
              />
            ))}
          </div>
        ) : null}
        {canEdit ? (
          <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
            <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
              Save changes
            </Button>
            {form.formState.isDirty ? (
              <Button variant="ghost" onClick={() => form.reset()}>
                Discard
              </Button>
            ) : (
              <span className="text-xs text-muted">All changes saved</span>
            )}
          </div>
        ) : null}
      </Card>
    </form>
  );
}

function ListInput({ value, onChange, disabled, placeholder }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex h-7 items-center gap-1 rounded-lg bg-sunken pr-1 pl-2.5 text-[13px] text-ink-2">
            {v}
            {!disabled ? (
              <button suppressHydrationWarning type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 text-subtle hover:text-ink">
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {!disabled ? (
        <div className="flex max-w-[360px] gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
            <Plus /> Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

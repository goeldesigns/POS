"use client";

import { Copy, KeyRound, LogOut, Pencil, Plus, Ticket, Trash } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { SelectField, SwitchField, TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Badge, Card, EmptyState, InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { pluralize } from "@/lib/utils";
import { taxRateSchema } from "@/lib/validation/menu";
import { couponSchema } from "@/lib/validation/operations";
import { toDateInputValue } from "@/lib/validation/helpers";
import {
  createApiKeyAction,
  deleteCouponAction,
  deleteTaxRateAction,
  revokeApiKeyAction,
  saveCouponAction,
  saveTaxRateAction,
  signOutOtherSessionsAction,
} from "@/server/actions/settings";


// ─── Tax rates ──────────────────────────────────────────────────────────────

export interface TaxRateRow {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
  products: number;
}

export function TaxRates({ rows }: { rows: TaxRateRow[] }) {
  const session = useSession();
  const [editing, setEditing] = React.useState<TaxRateRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<TaxRateRow | null>(null);
  const del = useAction(deleteTaxRateAction, { success: "Tax rate deleted", onSuccess: () => setDeleting(null) });
  const canEdit = session.can("settings.edit");
  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Tax rates</h3>
          <p className="text-[13px] text-muted">The default applies to items without their own rate. GST prints as CGST + SGST.</p>
        </div>
        {canEdit ? <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add rate</Button> : null}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
            <span className="w-16 font-semibold text-ink">{t.rate}%</span>
            <span className="flex-1 text-ink-2">
              {t.name} {t.isDefault ? <Badge size="sm" tone="brand">Default</Badge> : null} {!t.isActive ? <Badge size="sm">Inactive</Badge> : null}
            </span>
            <span className="text-xs text-muted">
              {t.isDefault ? (t.products ? `${pluralize(t.products, "item")} + all items without a rate` : "All items without a rate") : t.products ? pluralize(t.products, "item") : "Not used"}
            </span>
            {canEdit ? (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-xs" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil /></Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${t.name}`}
                  title={t.isDefault ? "Make another rate the default first" : t.products ? "Move the items using this rate first" : undefined}
                  disabled={t.isDefault || t.products > 0}
                  onClick={() => setDeleting(t)}
                >
                  <Trash />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <TaxRateDialog value={editing === "new" ? null : editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="No menu items use this rate. It can be added again later."
        confirmLabel="Delete"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </Card>
  );
}

function TaxRateDialog({ value, open, onOpenChange }: { value: TaxRateRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useZodForm(taxRateSchema, { name: "", rate: "5", isDefault: false, isActive: true });
  React.useEffect(() => {
    if (open) form.reset(value ? { id: value.id, name: value.name, rate: String(value.rate), isDefault: value.isDefault, isActive: value.isActive } : { name: "", rate: "5", isDefault: false, isActive: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, saveTaxRateAction, { success: "Tax rate saved", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? "Edit tax rate" : "Add tax rate"} size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <TextField control={form.control} name="name" label="Name" required placeholder="GST 5%" autoFocus />
              <TextField control={form.control} name="rate" label="Rate" required suffix="%" inputMode="decimal" />
            </div>
            <SwitchField control={form.control} name="isDefault" label="Default rate" />
            <SwitchField control={form.control} name="isActive" label="Active" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Coupons ────────────────────────────────────────────────────────────────

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENT" | "FLAT";
  value: number;
  minOrder: number | null;
  maxDiscount: number | null;
  validFrom: string | null;
  validTo: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export function CouponsSettings({ rows }: { rows: CouponRow[] }) {
  const session = useSession();
  const [editing, setEditing] = React.useState<CouponRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<CouponRow | null>(null);
  const del = useAction(deleteCouponAction, { success: "Coupon removed", onSuccess: () => setDeleting(null) });
  const canEdit = session.can("settings.edit");
  const now = Date.now();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Discounts & coupons</h2>
          <p className="text-[13px] text-muted">Codes cashiers can apply at the POS. Usage is tracked automatically.</p>
        </div>
        {canEdit ? <Button onClick={() => setEditing("new")}><Plus /> New coupon</Button> : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Ticket />} title="No coupons yet" description="Create codes like WELCOME10 for first-time guests." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="bg-canvas/70 text-xs text-muted">
                {["Code", "Discount", "Conditions", "Valid", "Used", "Status", ""].map((h) => <th key={h} className="px-4 py-2.5 text-left font-medium first:pl-5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const expired = !!c.validTo && new Date(c.validTo).getTime() < now;
                return (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-4 py-2.5 pl-5"><p className="font-mono font-semibold text-ink">{c.code}</p><p className="text-xs text-muted">{c.description}</p></td>
                    <td className="px-4 py-2.5">{c.type === "PERCENT" ? `${c.value}%` : formatMoney(c.value)}{c.maxDiscount ? <span className="text-xs text-muted"> · max {formatMoney(c.maxDiscount)}</span> : null}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{c.minOrder ? `Min. bill ${formatMoney(c.minOrder)}` : "No minimum"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{c.validFrom || c.validTo ? `${c.validFrom ? formatDate(c.validFrom, "UTC") : "Now"} – ${c.validTo ? formatDate(c.validTo, "UTC") : "no end"}` : "Always"}</td>
                    <td className="tabular px-4 py-2.5">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                    <td className="px-4 py-2.5">{!c.isActive ? <Badge>Inactive</Badge> : expired ? <Badge tone="warning">Expired</Badge> : <Badge tone="success" dot>Active</Badge>}</td>
                    <td className="px-4 py-2.5 pr-5 text-right">
                      {canEdit ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-xs" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}><Pencil /></Button>
                          <Button variant="ghost" size="icon-xs" aria-label={`Delete ${c.code}`} onClick={() => setDeleting(c)}><Trash /></Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <CouponDialog value={editing === "new" ? null : editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.code}?`}
        description={deleting?.usedCount ? "It has been used, so it will be deactivated rather than deleted." : "The code will stop working immediately."}
        confirmLabel="Remove"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </Card>
  );
}

function CouponDialog({ value, open, onOpenChange }: { value: CouponRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const blank = { code: "", description: "", type: "PERCENT" as const, value: "10", minOrder: "", maxDiscount: "", validFrom: "", validTo: "", usageLimit: "", isActive: true };
  const form = useZodForm(couponSchema, blank);
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id, code: value.code, description: value.description ?? "", type: value.type, value: String(value.type === "FLAT" ? value.value / 100 : value.value),
            minOrder: value.minOrder ? String(value.minOrder / 100) : "", maxDiscount: value.maxDiscount ? String(value.maxDiscount / 100) : "",
            validFrom: toDateInputValue(value.validFrom), validTo: toDateInputValue(value.validTo), usageLimit: value.usageLimit ? String(value.usageLimit) : "", isActive: value.isActive,
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const type = form.watch("type");
  const submit = useFormSubmit(form, saveCouponAction, { success: "Coupon saved", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.code}` : "New coupon"} size="md">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="code" label="Code" required className="[&_input]:font-mono [&_input]:uppercase" autoFocus />
              <TextField control={form.control} name="description" label="Description" optional placeholder="Shown to the cashier" />
              <SelectField control={form.control} name="type" label="Type" options={[{ value: "PERCENT", label: "Percentage off" }, { value: "FLAT", label: "Flat amount off" }]} />
              <TextField control={form.control} name="value" label={type === "PERCENT" ? "Percent" : "Amount"} required prefix={type === "FLAT" ? "₹" : undefined} suffix={type === "PERCENT" ? "%" : undefined} inputMode="decimal" />
              <TextField control={form.control} name="minOrder" label="Minimum bill" optional prefix="₹" inputMode="decimal" />
              <TextField control={form.control} name="maxDiscount" label="Maximum discount" optional prefix="₹" inputMode="decimal" />
              <TextField control={form.control} name="validFrom" label="Valid from" optional type="date" />
              <TextField control={form.control} name="validTo" label="Valid until" optional type="date" />
              <TextField control={form.control} name="usageLimit" label="Total uses allowed" optional inputMode="numeric" />
            </div>
            <SwitchField control={form.control} name="isActive" label="Active" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Save coupon</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── API keys ───────────────────────────────────────────────────────────────

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const SCOPES = [
  { value: "menu:read", label: "Read menu", hint: "Online menu & availability" },
  { value: "orders:write", label: "Create orders", hint: "Website / app checkout" },
  { value: "orders:read", label: "Read orders", hint: "Order status tracking" },
  { value: "customers:write", label: "Create customers", hint: "Sign-ups from your site" },
] as const;

export function ApiKeys({ rows, allowed, baseUrl }: { rows: ApiKeyRow[]; allowed: boolean; baseUrl: string }) {
  const session = useSession();
  const tz = session.restaurant.timezone;
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["menu:read", "orders:write"]);
  const [created, setCreated] = React.useState<string | null>(null);
  const create = useAction(createApiKeyAction, { onSuccess: (r) => setCreated(r.key) });
  const revoke = useAction(revokeApiKeyAction, { success: "API key revoked" });
  const canEdit = session.can("settings.edit");
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">API keys</h2>
          <p className="text-[13px] text-muted">Connect your website, ordering app or other systems to this restaurant.</p>
        </div>
        {canEdit && allowed ? <Button onClick={() => { setOpen(true); setCreated(null); setName(""); }}><KeyRound /> Create key</Button> : null}
      </div>
      {!allowed ? (
        <div className="p-5"><InlineAlert tone="warning">API access is part of the Enterprise plan. Contact Tabla to upgrade.</InlineAlert></div>
      ) : null}
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
              <span className="min-w-[160px] flex-1">
                <span className="block font-medium text-ink">{k.name} {k.revokedAt ? <Badge size="sm" tone="danger">Revoked</Badge> : null}</span>
                <span className="font-mono text-xs text-muted">{k.prefix}…</span>
              </span>
              <span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s} size="sm">{s}</Badge>)}</span>
              <span className="w-[180px] text-xs text-muted">{k.lastUsedAt ? `Used ${formatDateTime(k.lastUsedAt, tz)}` : "Never used"}</span>
              {canEdit && !k.revokedAt ? <Button variant="ghost" size="sm" className="text-danger-700" loading={revoke.pending} onClick={() => revoke.execute({ id: k.id })}>Revoke</Button> : null}
            </li>
          ))}
        </ul>
      ) : allowed ? (
        <EmptyState compact icon={<KeyRound />} title="No API keys" description="Create a key to let your website place orders into this POS." />
      ) : null}
      <div className="border-t border-line bg-canvas/50 px-5 py-3 text-xs text-muted">
        Example: <span className="font-mono">curl -H &quot;Authorization: Bearer tbl_live_…&quot; {baseUrl}/api/v1/menu</span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={created ? "Copy your API key" : "Create API key"} size="sm">
          <DialogBody className="space-y-4">
            {created ? (
              <>
                <InlineAlert tone="warning">This is the only time the key is shown. Store it in your website's server environment — never in browser code.</InlineAlert>
                <div className="flex gap-2">
                  <Input readOnly value={created} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" aria-label="Copy" onClick={() => { void navigator.clipboard.writeText(created); toast.success("Copied"); }}><Copy /></Button>
                </div>
              </>
            ) : (
              <>
                <Field label="Name" required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website ordering" autoFocus />
                </Field>
                <div className="space-y-2">
                  <p className="text-[13px] font-medium text-ink-2">Scopes</p>
                  {SCOPES.map((s) => (
                    <label key={s.value} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                      <Checkbox checked={scopes.includes(s.value)} onCheckedChange={(v) => setScopes(v ? [...scopes, s.value] : scopes.filter((x) => x !== s.value))} className="mt-0.5" />
                      <span><span className="font-medium text-ink">{s.label}</span> <span className="font-mono text-xs text-muted">{s.value}</span><span className="block text-xs text-muted">{s.hint}</span></span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {created ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button loading={create.pending} disabled={!name.trim() || !scopes.length} onClick={() => create.execute({ name: name.trim(), scopes: scopes as never })}>Create key</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function SessionsCard({ sessions }: { sessions: { id: string; userAgent: string | null; ipAddress: string | null; lastSeenAt: string; current: boolean }[] }) {
  const session = useSession();
  const run = useAction(signOutOtherSessionsAction, { success: (r) => `Signed out of ${r.count} other session${r.count === 1 ? "" : "s"}` });
  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Your active sessions</h3>
          <p className="text-[13px] text-muted">Devices currently signed in as {session.user.email}.</p>
        </div>
        <Button variant="outline" size="sm" loading={run.pending} disabled={sessions.length <= 1} onClick={() => run.execute({})}>
          <LogOut /> Sign out other devices
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
            <span>
              <span className="block text-ink">{describeAgent(s.userAgent)} {s.current ? <Badge size="sm" tone="success">This device</Badge> : null}</span>
              <span className="text-xs text-muted">{s.ipAddress ?? "Unknown IP"}</span>
            </span>
            <span className="text-xs text-muted">Active {formatDateTime(s.lastSeenAt, session.restaurant.timezone)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

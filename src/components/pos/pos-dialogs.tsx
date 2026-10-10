"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Gift, Minus, Phone, Plus, Search, Ticket, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, FoodTypeMark, InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/controls";
import { PillTabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api-client";
import { formatElapsed, formatMoney, formatPhone, toMinor } from "@/lib/format";
import { TABLE_STATUS, statusOf } from "@/lib/labels";
import { maxRedeemablePoints } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { previewCouponAction, quickCreateCustomerAction } from "@/server/actions/pos";
import type { PosBootstrap } from "@/server/services/pos";
import type { CartLine, CouponDef, PosCustomer, Product } from "./pos-store";
import { ProductImage } from "./product-image";

// ─── Customize (variants & modifiers) ───────────────────────────────────────

export function CustomizeDialog({
  product,
  onClose,
  onAdd,
}: {
  product: Product | null;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const [variantId, setVariantId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [qty, setQty] = React.useState(1);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!product) return;
    setVariantId(product.variants.find((v) => v.isDefault)?.id ?? product.variants[0]?.id ?? null);
    setSelected(new Set());
    setQty(1);
    setNote("");
  }, [product]);

  if (!product) return null;
  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const mods = product.modifierGroups.flatMap((g) => g.modifiers).filter((m) => selected.has(m.id));
  const unit = (variant?.price ?? product.price) + mods.reduce((s, m) => s + m.price, 0);
  const unmet = product.modifierGroups.find((g) => g.modifiers.filter((m) => selected.has(m.id)).length < g.minSelect);

  const toggle = (groupId: string, modifierId: string) => {
    const group = product.modifierGroups.find((g) => g.id === groupId)!;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modifierId)) {
        next.delete(modifierId);
        return next;
      }
      if (group.maxSelect === 1) for (const m of group.modifiers) next.delete(m.id);
      else if (group.modifiers.filter((m) => next.has(m.id)).length >= group.maxSelect) return prev;
      next.add(modifierId);
      return next;
    });
  };

  const add = () => {
    onAdd({
      productId: product.id,
      variantId: variant?.id ?? null,
      modifierIds: mods.map((m) => m.id),
      quantity: qty,
      notes: note.trim() || null,
      name: product.name,
      variantName: variant?.name ?? null,
      modifierNames: mods.map((m) => m.name),
      unitPrice: variant?.price ?? product.price,
      modifiersTotal: mods.reduce((s, m) => s + m.price, 0),
      taxRate: product.taxRate,
      imageUrl: product.imageUrl,
      foodType: product.foodType,
    });
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={product.name} description={product.description ?? undefined} size="md">
        <DialogBody className="space-y-5">
          <div className="flex items-center gap-3">
            <ProductImage src={product.imageUrl} name={product.name} className="size-16 shrink-0 rounded-xl" />
            <div className="text-[13px] text-muted">
              <p className="flex items-center gap-1.5">
                <FoodTypeMark type={product.foodType} /> {product.sku}
                {product.preparationTime ? ` · ~${product.preparationTime} min` : ""}
              </p>
              {product.comboSummary ? <p className="mt-1">Includes: {product.comboSummary}</p> : null}
            </div>
          </div>

          {product.variants.length ? (
            <section>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">Choose size <span className="font-normal text-muted">· required</span></h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {product.variants.map((v) => (
                  <button suppressHydrationWarning
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                      v.id === variantId ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="tabular">{formatMoney(v.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {product.modifierGroups.map((g) => (
            <section key={g.id}>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">
                {g.name}{" "}
                <span className="font-normal text-muted">
                  · {g.minSelect > 0 ? `choose ${g.minSelect}${g.maxSelect > g.minSelect ? `–${g.maxSelect}` : ""}` : `optional, up to ${g.maxSelect}`}
                </span>
              </h4>
              <div className="flex flex-wrap gap-2">
                {g.modifiers.map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <button suppressHydrationWarning
                      key={m.id}
                      type="button"
                      onClick={() => toggle(g.id, m.id)}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
                        on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line hover:border-line-strong",
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                      {m.name}
                      {m.price ? <span className="text-muted">+{formatMoney(m.price)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <Field label="Kitchen note" optional>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. less oil, no onion" maxLength={200} />
          </Field>
        </DialogBody>
        <DialogFooter className="justify-between">
          <QuantityStepper value={qty} onChange={setQty} />
          <Button onClick={add} disabled={!!unmet} size="lg">
            {unmet ? `Choose ${unmet.name.toLowerCase()}` : `Add to order · ${formatMoney(unit * qty)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuantityStepper({ value, onChange, size = "md" }: { value: number; onChange: (n: number) => void; size?: "sm" | "md" }) {
  const s = size === "sm" ? "size-7" : "size-9";
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-surface">
      <button suppressHydrationWarning type="button" aria-label="Decrease" className={cn("grid place-items-center text-muted hover:text-ink", s)} onClick={() => onChange(Math.max(1, value - 1))}>
        <Minus className="size-3.5" />
      </button>
      <span className={cn("tabular text-center font-medium text-ink", size === "sm" ? "w-6 text-[13px]" : "w-8 text-sm")}>{value}</span>
      <button suppressHydrationWarning type="button" aria-label="Increase" className={cn("grid place-items-center text-muted hover:text-ink", s)} onClick={() => onChange(Math.min(500, value + 1))}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

// ─── Table picker ───────────────────────────────────────────────────────────

type Floor = PosBootstrap["floors"][number];

const TABLE_TILE: Record<string, string> = {
  AVAILABLE: "border-success-100 bg-success-50/60 hover:border-success",
  OCCUPIED: "border-brand-200 bg-brand-50 hover:border-brand-400",
  RESERVED: "border-warning-100 bg-warning-50/70 hover:border-warning",
  CLEANING: "border-info-100 bg-info-50/60 hover:border-info",
  BLOCKED: "border-line bg-sunken opacity-60 cursor-not-allowed",
};

export function TablePicker({
  open,
  onOpenChange,
  floors,
  currentTableId,
  currentOrderId,
  onSelect,
  onOpenOrder,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  floors: Floor[];
  currentTableId: string | null;
  currentOrderId: string | null;
  onSelect: (tableId: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const [floor, setFloor] = React.useState(floors[0]?.id ?? "");
  const active = floors.find((f) => f.id === floor) ?? floors[0];
  const free = floors.flatMap((f) => f.tables).filter((t) => t.status === "AVAILABLE").length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Choose a table" description={`${free} tables free right now`} size="lg">
        <DialogBody>
          {floors.length === 0 ? (
            <EmptyState icon={<Users />} title="No tables set up" description="Add sections and tables from the Tables page." />
          ) : (
            <>
              <PillTabs items={floors.map((f) => ({ value: f.id, label: f.name, count: f.tables.length }))} value={active?.id ?? ""} onChange={setFloor} />
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-2.5">
                {active?.tables.map((t) => {
                  const mine = t.openOrder && t.openOrder.id === currentOrderId;
                  const busy = !!t.openOrder && !mine;
                  return (
                    <button suppressHydrationWarning
                      key={t.id}
                      type="button"
                      disabled={t.status === "BLOCKED" || !!t.mergedIntoId}
                      onClick={() => {
                        if (busy) onOpenOrder(t.openOrder!.id);
                        else onSelect(t.id);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "relative rounded-xl border p-3 text-left transition-colors",
                        TABLE_TILE[t.status],
                        t.id === currentTableId && "ring-2 ring-brand-500 ring-offset-1",
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[15px] font-semibold text-ink">{t.name}</span>
                        <span className="text-2xs text-muted">{t.capacity} seats</span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-ink-2">{t.mergedIntoId ? "Merged" : statusOf(TABLE_STATUS, t.status).label}</p>
                      {t.openOrder ? (
                        <>
                          <p className="mt-1 flex items-baseline justify-between gap-2 text-2xs text-muted">
                            <span className="truncate">{t.openOrder.orderNumber}</span>
                            <span className="tabular shrink-0 font-semibold text-ink">{formatMoney(t.openOrder.total, { decimals: 0 })}</span>
                          </p>
                          {t.occupiedSince ? <p className="text-2xs text-muted">Seated {formatElapsed(t.occupiedSince)}</p> : null}
                        </>
                      ) : null}
                      {busy ? <span className="mt-1.5 block text-2xs font-semibold text-brand-600">Open order →</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ─── Customer picker ────────────────────────────────────────────────────────

interface CustomerHit {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  totalOrders: number;
  loyaltyBalance: number;
}

export function CustomerPicker({
  open,
  onOpenChange,
  onSelect,
  loyaltyEnabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (c: PosCustomer) => void;
  loyaltyEnabled: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", phone: "", email: "" });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);
  React.useEffect(() => {
    if (!open) {
      setQ("");
      setCreating(false);
      setErrors({});
    }
  }, [open]);

  const { data = [], isFetching } = useQuery({
    queryKey: ["pos-customers", debounced],
    queryFn: () => apiFetch<CustomerHit[]>(`/api/v1/customers/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && !creating,
  });

  const create = useAction(quickCreateCustomerAction, {
    quietErrors: true,
    onError: (r) => setErrors(r.fieldErrors ?? {}),
    success: (c) => (c.existed ? `${c.name} already exists — selected` : `${c.name} added`),
    onSuccess: (c) => {
      onSelect({ id: c.id, name: c.name, phone: c.phone, loyaltyBalance: c.loyaltyBalance });
      onOpenChange(false);
    },
  });

  const startCreate = () => {
    const digits = q.replace(/\D/g, "");
    setForm({ name: digits.length >= 6 ? "" : q, phone: digits.length >= 6 ? digits : "", email: "" });
    setCreating(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={creating ? "New customer" : "Add customer"} description={creating ? "Saved to your customer list." : "Search by phone number or name."} size="md">
        {creating ? (
          <>
            <DialogBody className="space-y-4">
              <Field label="Phone" required error={errors.phone}>
                <Input autoFocus prefix={<Phone />} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98450 12345" inputMode="tel" />
              </Field>
              <Field label="Name" required error={errors.name}>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email" optional error={errors.email} description="Used for e-receipts.">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Back to search
              </Button>
              <Button loading={create.pending} onClick={() => create.execute({ name: form.name, phone: form.phone, email: form.email || null })}>
                Save & select
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="border-b border-line px-5 py-3">
              <Input
                autoFocus
                prefix={<Search />}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Phone, name or email"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && data[0]) {
                    onSelect({ id: data[0].id, name: data[0].name, phone: data[0].phone, loyaltyBalance: data[0].loyaltyBalance });
                    onOpenChange(false);
                  }
                }}
              />
            </div>
            <DialogBody className="px-2 py-2">
              {data.length === 0 && !isFetching ? (
                <EmptyState
                  compact
                  icon={<Users />}
                  title={debounced ? "No customer found" : "No customers yet"}
                  description={debounced ? `Nobody matches “${debounced}”.` : undefined}
                  action={
                    <Button size="sm" onClick={startCreate}>
                      <UserPlus /> Create customer
                    </Button>
                  }
                />
              ) : (
                <ul>
                  {data.map((c) => (
                    <li key={c.id}>
                      <button suppressHydrationWarning
                        type="button"
                        onClick={() => {
                          onSelect({ id: c.id, name: c.name, phone: c.phone, loyaltyBalance: c.loyaltyBalance });
                          onOpenChange(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-canvas"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{c.name}</span>
                          <span className="block text-xs text-muted">
                            {formatPhone(c.phone)} · {c.totalOrders} orders
                          </span>
                        </span>
                        {loyaltyEnabled ? (
                          <Badge tone="brand" size="sm">
                            {c.loyaltyBalance} pts
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogBody>
            <DialogFooter className="justify-between">
              <span className="text-xs text-muted">{isFetching ? "Searching…" : "Enter selects the first result"}</span>
              <Button variant="outline" onClick={startCreate}>
                <UserPlus /> New customer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Discount / coupon / points / note ──────────────────────────────────────

export function DiscountDialog({
  open,
  onOpenChange,
  subtotal,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subtotal: number;
  current: { type: "PERCENT" | "FLAT"; value: number; reason: string | null } | null;
  onApply: (d: { type: "PERCENT" | "FLAT"; value: number; reason: string | null } | null) => void;
}) {
  const [type, setType] = React.useState<"PERCENT" | "FLAT">(current?.type ?? "PERCENT");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState(current?.reason ?? "");
  React.useEffect(() => {
    if (open) {
      setType(current?.type ?? "PERCENT");
      setValue(current ? String(current.type === "FLAT" ? current.value / 100 : current.value) : "");
      setReason(current?.reason ?? "");
    }
  }, [open, current]);

  const num = Number(value);
  const valid = value !== "" && Number.isFinite(num) && num > 0 && (type === "PERCENT" ? num <= 100 : toMinor(num) <= subtotal);
  const preview = valid ? (type === "PERCENT" ? Math.round((subtotal * num) / 100) : toMinor(num)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Apply discount" description={`Bill subtotal ${formatMoney(subtotal)}`} size="sm">
        <DialogBody className="space-y-4">
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "PERCENT", label: "Percentage" },
              { value: "FLAT", label: "Flat amount" },
            ]}
          />
          {type === "PERCENT" ? (
            <div className="flex gap-2">
              {[5, 10, 15, 20].map((p) => (
                <Button key={p} variant={num === p ? "secondary" : "outline"} size="sm" onClick={() => setValue(String(p))}>
                  {p}%
                </Button>
              ))}
            </div>
          ) : null}
          <Field label={type === "PERCENT" ? "Discount %" : "Discount amount"}>
            <Input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} prefix={type === "FLAT" ? "₹" : undefined} suffix={type === "PERCENT" ? "%" : undefined} />
          </Field>
          <Field label="Reason" optional>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Regular guest, delayed order" maxLength={120} />
          </Field>
          {valid ? <p className="text-[13px] text-success-700">Saves {formatMoney(preview)} on this bill.</p> : null}
        </DialogBody>
        <DialogFooter>
          {current ? (
            <Button variant="ghost" className="mr-auto text-danger-700" onClick={() => { onApply(null); onOpenChange(false); }}>
              Remove discount
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onApply({ type, value: type === "PERCENT" ? num : toMinor(num), reason: reason.trim() || null });
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CouponDialog({
  open,
  onOpenChange,
  subtotal,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subtotal: number;
  current: CouponDef | null;
  onApply: (c: CouponDef | null) => void;
}) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const preview = useAction(previewCouponAction, {
    quietErrors: true,
    onError: (r) => setError(r.error),
    onSuccess: (c) => {
      onApply({ code: c.code, description: c.description, type: c.type, value: c.value, maxAmount: c.maxAmount });
      onOpenChange(false);
    },
  });
  React.useEffect(() => {
    if (open) {
      setCode(current?.code ?? "");
      setError(null);
    }
  }, [open, current]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Apply coupon" size="sm">
        <DialogBody className="space-y-3">
          <Field label="Coupon code" error={error}>
            <Input
              autoFocus
              prefix={<Ticket />}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && code && preview.execute({ code, subtotal })}
              placeholder="e.g. WELCOME10"
              className="uppercase"
            />
          </Field>
          {current ? (
            <InlineAlert tone="success" title={`${current.code} applied`}>
              {current.description}
            </InlineAlert>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {current ? (
            <Button variant="ghost" className="mr-auto text-danger-700" onClick={() => { onApply(null); onOpenChange(false); }}>
              Remove coupon
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={preview.pending} disabled={code.length < 3} onClick={() => preview.execute({ code, subtotal })}>
            Validate & apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PointsDialog({
  open,
  onOpenChange,
  customer,
  billMinor,
  loyalty,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: PosCustomer | null;
  billMinor: number;
  loyalty: PosBootstrap["loyalty"];
  current: number;
  onApply: (points: number) => void;
}) {
  const [points, setPoints] = React.useState("");
  React.useEffect(() => {
    if (open) setPoints(current ? String(current) : "");
  }, [open, current]);
  if (!customer) return null;
  const max = maxRedeemablePoints({
    balance: customer.loyaltyBalance,
    billMinor,
    pointValue: loyalty.pointValue,
    maxRedeemPercent: loyalty.maxRedeemPercent,
    minRedeemPoints: loyalty.minRedeemPoints,
  });
  const n = Math.floor(Number(points) || 0);
  const valid = n > 0 && n <= max;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Redeem loyalty points" description={`${customer.name} has ${customer.loyaltyBalance} points`} size="sm">
        <DialogBody className="space-y-3">
          {max === 0 ? (
            <InlineAlert tone="warning" icon={<Gift />}>
              {customer.loyaltyBalance < loyalty.minRedeemPoints
                ? `Minimum ${loyalty.minRedeemPoints} points needed to redeem.`
                : "This bill is too small to redeem points."}
            </InlineAlert>
          ) : (
            <>
              <p className="text-[13px] text-muted">
                1 point = {formatMoney(loyalty.pointValue)} · up to {loyalty.maxRedeemPercent}% of the bill ({max} points on this order).
              </p>
              <Field label="Points to redeem">
                <Input autoFocus inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))} suffix="pts" />
              </Field>
              <Button variant="secondary" size="sm" onClick={() => setPoints(String(max))}>
                Use maximum ({max} pts = {formatMoney(max * loyalty.pointValue)})
              </Button>
              {valid ? <p className="text-[13px] text-success-700">Saves {formatMoney(n * loyalty.pointValue)}.</p> : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {current ? (
            <Button variant="ghost" className="mr-auto text-danger-700" onClick={() => { onApply(0); onOpenChange(false); }}>
              Remove
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={() => { onApply(n); onOpenChange(false); }}>
            Redeem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NoteDialog({ open, onOpenChange, value, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; value: string; onSave: (v: string) => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => {
    if (open) setText(value);
  }, [open, value]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Order note" description="Printed on the kitchen ticket." size="sm">
        <DialogBody>
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="e.g. Serve starters first, birthday at the table" />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(text.trim()); onOpenChange(false); }}>Save note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

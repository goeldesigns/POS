"use client";

import { Plus, Trash } from "lucide-react";
import * as React from "react";
import { useFieldArray } from "react-hook-form";
import { SelectField, SwitchField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney, formatQuantity, toMinor } from "@/lib/format";
import { compatibleUnits, convertQuantity, STOCK_UNITS, UNIT_LABELS } from "@/lib/units";
import { toDateInputValue } from "@/lib/validation/helpers";
import { ingredientSchema, INGREDIENT_CATEGORIES, purchaseSchema, supplierSchema, WASTE_REASONS } from "@/lib/validation/inventory";
import { recordWasteAction, saveIngredientAction, savePurchaseAction, saveSupplierAction, stockMovementAction } from "@/server/actions/inventory";
import type { IngredientRow, PurchaseRow, SupplierRow } from "@/server/services/inventory";
import type { StockUnit } from "@/lib/enums";

export function IngredientDialog({
  open,
  onOpenChange,
  value,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: IngredientRow | null;
  suppliers: { id: string; name: string }[];
}) {
  const blank = { name: "", sku: "", category: "Vegetables", unit: "KG" as const, minStock: "0", maxStock: "", costPerUnit: "", supplierId: "", expiryDate: "", storageLocation: "", openingStock: "", isActive: true };
  const form = useZodForm(ingredientSchema, blank);
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id, name: value.name, sku: value.sku, category: value.category, unit: value.unit, minStock: String(value.minStock), maxStock: value.maxStock != null ? String(value.maxStock) : "",
            costPerUnit: String(value.costPerUnit / 100), supplierId: value.supplier?.id ?? "", expiryDate: toDateInputValue(value.expiryDate), storageLocation: value.storageLocation ?? "", openingStock: "", isActive: value.isActive,
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const unit = form.watch("unit");
  const submit = useFormSubmit(form, saveIngredientAction, { success: value ? "Ingredient updated" : "Ingredient added", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.name}` : "Add ingredient"} size="lg">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="name" label="Name" required autoFocus className="sm:col-span-2" />
              <TextField control={form.control} name="sku" label="SKU" required className="[&_input]:uppercase" placeholder="ING-XXX" />
              <SelectField control={form.control} name="category" label="Category" options={INGREDIENT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
              <SelectField control={form.control} name="unit" label="Stock unit" options={STOCK_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))} description={value ? "Change only when stock is zero" : undefined} />
              <TextField control={form.control} name="costPerUnit" label={`Cost per ${UNIT_LABELS[unit as StockUnit]}`} required prefix="₹" inputMode="decimal" />
              <TextField control={form.control} name="minStock" label="Minimum stock" required inputMode="decimal" suffix={UNIT_LABELS[unit as StockUnit]} description="Low-stock alert below this" />
              <TextField control={form.control} name="maxStock" label="Maximum stock" optional inputMode="decimal" suffix={UNIT_LABELS[unit as StockUnit]} />
              {!value ? <TextField control={form.control} name="openingStock" label="Opening stock" optional inputMode="decimal" suffix={UNIT_LABELS[unit as StockUnit]} /> : <div />}
              <SelectField control={form.control} name="supplierId" label="Supplier" placeholder="None" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <TextField control={form.control} name="storageLocation" label="Storage location" optional placeholder="Cold room, Dry store…" />
              <TextField control={form.control} name="expiryDate" label="Expiry date" optional type="date" />
            </div>
            {value ? <SwitchField control={form.control} name="isActive" label="Active" description="Inactive items are hidden from recipes and counts." /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{value ? "Save" : "Add ingredient"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type MoveMode = "ADD" | "ADJUST" | "TRANSFER_OUT" | "TRANSFER_IN";

export function MovementDialog({
  open,
  onOpenChange,
  ingredient,
  initialMode,
  allowed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ingredient: IngredientRow | null;
  initialMode: MoveMode;
  allowed: { add: boolean; adjust: boolean; transfer: boolean };
}) {
  const [mode, setMode] = React.useState<MoveMode>(initialMode);
  const [qty, setQty] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [counterparty, setCounterparty] = React.useState("");
  React.useEffect(() => {
    if (open && ingredient) {
      setMode(initialMode);
      setQty(initialMode === "ADJUST" ? String(ingredient.currentStock) : "");
      setCost(String(ingredient.costPerUnit / 100));
      setReason("");
      setCounterparty("");
    }
  }, [open, ingredient, initialMode]);
  const run = useAction(stockMovementAction, { success: (r) => `Stock updated · now ${formatQuantity(r.balance, ingredient ? UNIT_LABELS[ingredient.unit] : "")}`, onSuccess: () => onOpenChange(false) });
  if (!ingredient) return null;
  const u = UNIT_LABELS[ingredient.unit];
  const n = Number(qty);
  const delta = mode === "ADJUST" ? n - ingredient.currentStock : mode === "TRANSFER_OUT" ? -n : n;
  const options = [
    ...(allowed.add ? [{ value: "ADD" as const, label: "Stock in" }] : []),
    ...(allowed.adjust ? [{ value: "ADJUST" as const, label: "Count" }] : []),
    ...(allowed.transfer ? [{ value: "TRANSFER_OUT" as const, label: "Transfer out" }, { value: "TRANSFER_IN" as const, label: "Transfer in" }] : []),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={ingredient.name} description={`In stock: ${formatQuantity(ingredient.currentStock, u)}`} size="sm">
        <DialogBody className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={options} size="sm" />
          <Field label={mode === "ADJUST" ? "Counted quantity" : "Quantity"} description={mode === "ADJUST" ? "The physical count — we record the difference." : undefined}>
            <Input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} suffix={u} />
          </Field>
          {mode === "ADD" ? (
            <Field label={`Cost per ${u}`} description="Updates the ingredient's cost for recipe costing">
              <Input inputMode="decimal" prefix="₹" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          ) : null}
          {mode.startsWith("TRANSFER") ? (
            <Field label={mode === "TRANSFER_OUT" ? "Sent to" : "Received from"} required>
              <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="e.g. Indiranagar outlet, Central store" />
            </Field>
          ) : null}
          <Field label="Note" optional>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "ADJUST" ? "e.g. Weekly stock count" : ""} />
          </Field>
          {qty && Number.isFinite(n) ? (
            <p className="text-[13px] text-muted">
              Change: <span className={delta >= 0 ? "font-semibold text-success-700" : "font-semibold text-danger-700"}>{delta >= 0 ? "+" : ""}{formatQuantity(delta, u)}</span> → new balance{" "}
              <span className="font-semibold text-ink">{formatQuantity(ingredient.currentStock + delta, u)}</span>
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            loading={run.pending}
            disabled={!qty || !Number.isFinite(n) || n < 0 || (mode !== "ADJUST" && n === 0) || (mode.startsWith("TRANSFER") && !counterparty.trim())}
            onClick={() => run.execute({ ingredientId: ingredient.id, type: mode, quantity: qty, unitCost: mode === "ADD" ? cost : null, reason: reason || null, counterparty: counterparty || null })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WasteDialog({ open, onOpenChange, ingredients, preset }: { open: boolean; onOpenChange: (o: boolean) => void; ingredients: { id: string; name: string; unit: StockUnit; costPerUnit: number; currentStock: number }[]; preset?: string | null }) {
  const [ingredientId, setIngredientId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState<StockUnit>("KG");
  const [reason, setReason] = React.useState<string>(WASTE_REASONS[0]);
  const [notes, setNotes] = React.useState("");
  React.useEffect(() => {
    if (open) {
      const first = ingredients.find((i) => i.id === preset) ?? ingredients[0];
      setIngredientId(first?.id ?? "");
      setUnit(first?.unit ?? "KG");
      setQty("");
      setNotes("");
      setReason(WASTE_REASONS[0]);
    }
  }, [open, preset, ingredients]);
  const ing = ingredients.find((i) => i.id === ingredientId);
  const run = useAction(recordWasteAction, { success: "Waste recorded", onSuccess: () => onOpenChange(false) });
  const cost = ing && Number(qty) ? Math.round(convertQuantity(Number(qty), unit, ing.unit) * ing.costPerUnit) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record waste" description="Deducts stock and tracks the cost of what was thrown away." size="sm">
        <DialogBody className="space-y-4">
          <Field label="Ingredient" required>
            <NativeSelect
              value={ingredientId}
              onChange={(e) => {
                setIngredientId(e.target.value);
                const next = ingredients.find((i) => i.id === e.target.value);
                if (next) setUnit(next.unit);
              }}
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Quantity" required>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
            </Field>
            <Field label="Unit">
              <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)}>
                {(ing ? compatibleUnits(ing.unit) : STOCK_UNITS).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Reason" required>
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
              {WASTE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notes" optional>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {cost ? <p className="text-[13px] text-muted">Cost of waste: <span className="font-semibold text-danger-700">{formatMoney(cost)}</span></p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="danger" loading={run.pending} disabled={!ingredientId || !Number(qty)} onClick={() => run.execute({ ingredientId, quantity: qty, unit, reason, notes: notes || null })}>
            Record waste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierDialog({ open, onOpenChange, value }: { open: boolean; onOpenChange: (o: boolean) => void; value: SupplierRow | null }) {
  const blank = { name: "", contactPerson: "", phone: "", email: "", address: "", gstNumber: "", paymentTerms: "", notes: "", isActive: true };
  const form = useZodForm(supplierSchema, blank);
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? { id: value.id, name: value.name, contactPerson: value.contactPerson ?? "", phone: value.phone ?? "", email: value.email ?? "", address: value.address ?? "", gstNumber: value.gstNumber ?? "", paymentTerms: value.paymentTerms ?? "", notes: value.notes ?? "", isActive: value.isActive }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, saveSupplierAction, { success: value ? "Supplier updated" : "Supplier added", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.name}` : "Add supplier"} size="md">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Supplier name" required autoFocus />
              <TextField control={form.control} name="contactPerson" label="Contact person" optional />
              <TextField control={form.control} name="phone" label="Phone" optional />
              <TextField control={form.control} name="email" label="Email" optional type="email" />
              <TextField control={form.control} name="gstNumber" label="GSTIN" optional />
              <TextField control={form.control} name="paymentTerms" label="Payment terms" optional placeholder="Net 15, Weekly, COD…" />
            </div>
            <TextareaField control={form.control} name="address" label="Address" optional className="[&_textarea]:min-h-[56px]" />
            {value ? <SwitchField control={form.control} name="isActive" label="Active supplier" /> : null}
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

export function PurchaseDialog({
  open,
  onOpenChange,
  value,
  suppliers,
  ingredients,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: PurchaseRow | null;
  suppliers: { id: string; name: string }[];
  ingredients: { id: string; name: string; unit: StockUnit; costPerUnit: number; supplierId: string | null }[];
}) {
  const blank = { supplierId: "", invoiceNumber: "", status: "ORDERED" as const, notes: "", taxAmount: "0", items: [{ ingredientId: "", quantity: "", unitCost: "" }] };
  const form = useZodForm(purchaseSchema, blank);
  const items = useFieldArray({ control: form.control, name: "items" });
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id,
            supplierId: value.supplierId ?? "",
            invoiceNumber: value.invoiceNumber ?? "",
            status: value.status === "DRAFT" ? "DRAFT" : "ORDERED",
            notes: value.notes ?? "",
            taxAmount: String(value.taxAmount / 100),
            items: value.items.map((i) => ({ ingredientId: i.ingredientId, quantity: String(i.quantity), unitCost: String(i.unitCost / 100) })),
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const v = form.watch();
  const supplierItems = v.supplierId ? ingredients.filter((i) => i.supplierId === v.supplierId) : [];
  const subtotal = (v.items ?? []).reduce((s, i) => s + Math.round((Number(i.quantity) || 0) * toMinor(i.unitCost || 0)), 0);
  const submit = useFormSubmit(form, savePurchaseAction, { success: (r) => (form.getValues("status") === "RECEIVED" ? "Purchase received — stock updated" : "Purchase saved"), onSuccess: () => onOpenChange(false) });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.reference}` : "New purchase"} description="Record a supplier order. Stock is added when you mark it received." size="xl">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField control={form.control} name="supplierId" label="Supplier" placeholder="No supplier" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <TextField control={form.control} name="invoiceNumber" label="Invoice / bill no." optional />
              <SelectField
                control={form.control}
                name="status"
                label="Status"
                options={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "ORDERED", label: "Ordered — awaiting delivery" },
                  { value: "RECEIVED", label: "Received now (adds stock)" },
                ]}
              />
            </div>
            {supplierItems.length && !value ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                Quick add from this supplier:
                {supplierItems.slice(0, 8).map((i) => (
                  <button suppressHydrationWarning
                    key={i.id}
                    type="button"
                    className="rounded-md bg-sunken px-2 py-1 text-ink-2 hover:bg-brand-100 hover:text-brand-700"
                    onClick={() => {
                      const empty = (form.getValues("items") ?? []).findIndex((x) => !x.ingredientId);
                      const row = { ingredientId: i.id, quantity: "", unitCost: String(i.costPerUnit / 100) };
                      if (empty >= 0) items.update(empty, row);
                      else items.append(row);
                    }}
                  >
                    + {i.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="rounded-xl border border-line">
              <div className="grid grid-cols-[1fr_120px_130px_110px_40px] gap-2 border-b border-line bg-canvas/70 px-3 py-2 text-xs font-medium text-muted">
                <span>Ingredient</span>
                <span>Quantity</span>
                <span>Unit cost</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {items.fields.map((f, i) => {
                const line = v.items?.[i];
                const ing = line ? byId.get(line.ingredientId) : undefined;
                return (
                  <div key={f.id} className="grid grid-cols-[1fr_120px_130px_110px_40px] items-start gap-2 border-b border-line px-3 py-2 last:border-0">
                    <SelectField
                      control={form.control}
                      name={`items.${i}.ingredientId`}
                      placeholder="Choose…"
                      options={ingredients.map((x) => ({ value: x.id, label: `${x.name} (${UNIT_LABELS[x.unit]})` }))}
                    />
                    <TextField control={form.control} name={`items.${i}.quantity`} inputMode="decimal" suffix={ing ? UNIT_LABELS[ing.unit] : undefined} />
                    <TextField control={form.control} name={`items.${i}.unitCost`} inputMode="decimal" prefix="₹" />
                    <span className="tabular pt-2 text-right text-[13px] font-medium">{formatMoney(Math.round((Number(line?.quantity) || 0) * toMinor(line?.unitCost || 0)), { decimals: 2 })}</span>
                    <Button variant="ghost" size="icon" aria-label="Remove line" disabled={items.fields.length <= 1} onClick={() => items.remove(i)}>
                      <Trash />
                    </Button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => items.append({ ingredientId: "", quantity: "", unitCost: "" })}>
                  <Plus /> Add line
                </Button>
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="text-muted">Subtotal {formatMoney(subtotal, { decimals: 2 })}</span>
                  <TextField control={form.control} name="taxAmount" prefix="Tax ₹" inputMode="decimal" className="w-[140px]" />
                  <span className="font-semibold text-ink">Total {formatMoney(subtotal + toMinor(v.taxAmount || 0), { decimals: 2 })}</span>
                </div>
              </div>
            </div>
            <TextareaField control={form.control} name="notes" label="Notes" optional className="[&_textarea]:min-h-[56px]" />
            {v.status === "RECEIVED" ? <InlineAlert tone="info">Saving will add these quantities to stock and update ingredient costs.</InlineAlert> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{v.status === "RECEIVED" ? "Save & receive" : "Save purchase"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

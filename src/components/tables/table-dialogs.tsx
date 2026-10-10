"use client";

import { Pencil, Plus, Trash } from "lucide-react";
import * as React from "react";
import { SelectField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { tableSchema } from "@/lib/validation/operations";
import { TABLE_STATUS } from "@/lib/labels";
import { cn, pluralize } from "@/lib/utils";
import { deleteFloorAction, mergeTablesAction, saveFloorAction, saveTableAction, transferOrderAction } from "@/server/actions/tables";
import type { FloorPlan, FloorTable } from "@/server/services/tables";


export function TableFormDialog({
  open,
  onOpenChange,
  floors,
  table,
  defaultFloorId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  floors: FloorPlan;
  table: FloorTable | null;
  defaultFloorId?: string;
}) {
  const form = useZodForm(tableSchema, { name: "", floorId: defaultFloorId ?? floors[0]?.id ?? "", capacity: "4", shape: "SQUARE", notes: "" });
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      table
        ? { id: table.id, name: table.name, floorId: table.floorId, capacity: String(table.capacity), shape: table.shape, notes: table.notes ?? "" }
        : { name: "", floorId: defaultFloorId ?? floors[0]?.id ?? "", capacity: "4", shape: "SQUARE", notes: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table]);
  const submit = useFormSubmit(form, saveTableAction, { success: table ? "Table updated" : "Table added", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={table ? `Edit ${table.name}` : "Add table"} size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="name" label="Table name" required placeholder="e.g. T13" autoFocus />
              <TextField control={form.control} name="capacity" label="Seats" required inputMode="numeric" />
            </div>
            <SelectField control={form.control} name="floorId" label="Section" required options={floors.map((f) => ({ value: f.id, label: f.name }))} />
            <SelectField
              control={form.control}
              name="shape"
              label="Shape"
              options={[
                { value: "SQUARE", label: "Square" },
                { value: "ROUND", label: "Round" },
                { value: "RECTANGLE", label: "Rectangle" },
              ]}
            />
            <TextareaField control={form.control} name="notes" label="Notes" optional placeholder="e.g. Near window, wheelchair accessible" className="[&_textarea]:min-h-[64px]" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{table ? "Save changes" : "Add table"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SectionsDialog({ open, onOpenChange, floors, canDelete }: { open: boolean; onOpenChange: (o: boolean) => void; floors: FloorPlan; canDelete: boolean }) {
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const save = useAction(saveFloorAction, { success: "Section saved", onSuccess: () => { setName(""); setEditing(null); } });
  const remove = useAction(deleteFloorAction, { success: "Section removed" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Sections" description="Group tables by area — Main Hall, Outdoor, Private Dining, Bar…" size="sm">
        <DialogBody className="space-y-3">
          <ul className="divide-y divide-line rounded-xl border border-line">
            {floors.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === f.id ? (
                  <Input className="flex-1" inputSize="sm" value={editing.name} autoFocus onChange={(e) => setEditing({ id: f.id, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save.execute(editing)} />
                ) : (
                  <span className="flex-1 text-[13px] font-medium text-ink">
                    {f.name} <span className="font-normal text-muted">· {pluralize(f.tables.length, "table")}</span>
                  </span>
                )}
                {editing?.id === f.id ? (
                  <Button size="xs" loading={save.pending} onClick={() => save.execute(editing)}>Save</Button>
                ) : (
                  <Button variant="ghost" size="icon-xs" aria-label={`Rename ${f.name}`} onClick={() => setEditing({ id: f.id, name: f.name })}>
                    <Pencil />
                  </Button>
                )}
                {canDelete ? (
                  <Button variant="ghost" size="icon-xs" aria-label={`Delete ${f.name}`} disabled={f.tables.length > 0} onClick={() => remove.execute({ id: f.id })}>
                    <Trash />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="New section name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && save.execute({ name: name.trim() })} />
            <Button variant="secondary" disabled={!name.trim()} loading={save.pending && !editing} onClick={() => save.execute({ name: name.trim() })}>
              <Plus /> Add
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({
  open,
  onOpenChange,
  table,
  floors,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: FloorTable | null;
  floors: FloorPlan;
}) {
  const run = useAction(transferOrderAction, { success: (r) => `${r.orderNumber} moved`, onSuccess: () => onOpenChange(false) });
  const free = floors.flatMap((f) => f.tables.map((t) => ({ ...t, floor: f.name }))).filter((t) => !t.openOrder && t.status !== "BLOCKED" && !t.mergedInto);
  if (!table?.openOrder) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Move ${table.openOrder.orderNumber}`} description={`From ${table.name} to another free table`} size="md">
        <DialogBody>
          {free.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
              {free.map((t) => {
                const ready = t.status === "AVAILABLE";
                return (
                  <button
                    suppressHydrationWarning
                    key={t.id}
                    type="button"
                    disabled={run.pending}
                    onClick={() => run.execute({ orderId: table.openOrder!.id, tableId: t.id })}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                      ready ? "border-success-100 bg-success-50/60 hover:border-success" : "border-line bg-surface hover:border-line-strong",
                    )}
                  >
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{t.name}</span>
                      <span className="text-2xs whitespace-nowrap text-muted">{t.capacity} seats</span>
                    </p>
                    <p className={cn("mt-0.5 truncate text-2xs", ready ? "text-muted" : "font-medium text-warning-700")}>
                      {ready ? t.floor : `${TABLE_STATUS[t.status]?.label ?? t.status} · ${t.floor}`}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState compact title="No free tables" description="Every table is occupied or blocked right now." />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function MergeDialog({ open, onOpenChange, table, floors }: { open: boolean; onOpenChange: (o: boolean) => void; table: FloorTable | null; floors: FloorPlan }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (open) setSelected([]);
  }, [open]);
  const run = useAction(mergeTablesAction, { success: "Tables merged", onSuccess: () => onOpenChange(false) });
  if (!table) return null;
  const floor = floors.find((f) => f.id === table.floorId);
  const candidates = (floor?.tables ?? []).filter((t) => t.id !== table.id && !t.mergedInto && t.mergedTables.length === 0 && t.status !== "BLOCKED");
  const seats = table.capacity + candidates.filter((c) => selected.includes(c.id)).reduce((s, c) => s + c.capacity, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Merge with ${table.name}`} description="For a large party. Merged tables follow the primary table's order." size="md">
        <DialogBody>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
            {candidates.map((t) => {
              const on = selected.includes(t.id);
              // Only one open order can come along: the primary's, or one of the selected tables'.
              const blocked = !on && !!t.openOrder && (!!table.openOrder || candidates.some((c) => c.openOrder && selected.includes(c.id)));
              return (
                <label
                  key={t.id}
                  title={blocked ? "Only one of the merged tables can have an open order" : undefined}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border p-3",
                    on ? "border-brand-400 bg-brand-50" : "border-line",
                    blocked ? "cursor-not-allowed opacity-55" : "cursor-pointer",
                  )}
                >
                  <Checkbox
                    checked={on}
                    disabled={blocked}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, t.id] : s.filter((x) => x !== t.id)))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{t.name}</span>
                    <span className="block text-2xs whitespace-nowrap text-muted">{t.capacity} seats</span>
                    {t.openOrder ? <span className="block text-2xs whitespace-nowrap text-brand-600">{t.openOrder.orderNumber} open</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter className="justify-between">
          <span className="text-[13px] text-muted">{seats} seats in total</span>
          <Button disabled={!selected.length} loading={run.pending} onClick={() => run.execute({ primaryTableId: table.id, tableIds: selected })}>
            Merge {selected.length ? `${selected.length + 1} tables` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

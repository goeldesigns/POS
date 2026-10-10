"use client";

import { Layers, Pencil, Plus, Tags, Trash } from "lucide-react";
import * as React from "react";
import { useFieldArray } from "react-hook-form";
import { SwitchField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogFooter, ConfirmDialog } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney } from "@/lib/format";
import { pluralize } from "@/lib/utils";
import { categorySchema, modifierGroupSchema } from "@/lib/validation/menu";
import { deleteCategoryAction, deleteModifierGroupAction, saveCategoryAction, saveModifierGroupAction } from "@/server/actions/menu";

const SWATCHES = ["#5040D0", "#F59E0B", "#22A06B", "#E5484D", "#3B82F6", "#D946EF", "#0EA5E9", "#64748B"];

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  products: number;
}

export function CategoriesPanel({ rows }: { rows: CategoryRow[] }) {
  const session = useSession();
  const [editing, setEditing] = React.useState<CategoryRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<CategoryRow | null>(null);
  const del = useAction(deleteCategoryAction, { success: "Category removed", onSuccess: () => setDeleting(null) });
  const columns: Column<CategoryRow>[] = [
    {
      key: "name",
      header: "Category",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="size-3 rounded-full" style={{ background: r.color ?? "#9a99a5" }} />
          <div>
            <p className="font-medium text-ink">{r.name}</p>
            {r.description ? <p className="text-xs text-muted">{r.description}</p> : null}
          </div>
        </div>
      ),
    },
    { key: "products", header: "Items", align: "right", cell: (r) => r.products },
    { key: "sort", header: "POS position", align: "right", cell: (r) => r.sortOrder + 1 },
    { key: "active", header: "Status", cell: (r) => (r.isActive ? <Badge tone="success" dot>Visible</Badge> : <Badge dot>Hidden</Badge>) },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {session.can("menu.edit") ? (
            <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
              <Pencil />
            </Button>
          ) : null}
          {session.can("menu.delete") ? (
            <Button variant="ghost" size="icon-xs" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
              <Trash />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[13px] text-muted">Categories become tabs on the POS, in this order.</p>
        {session.can("menu.create") ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add category
          </Button>
        ) : null}
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} empty={<EmptyState icon={<Tags />} title="No categories yet" description="Create categories like Starters, Main Course and Beverages." />} />
      <CategoryDialog value={editing === "new" ? null : editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} nextSort={rows.length} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={deleting?.products ? `${pluralize(deleting.products, "item")} still use${deleting.products === 1 ? "s" : ""} this category — move them first.` : "This category will be removed from the POS."}
        confirmLabel="Delete"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </Card>
  );
}

function CategoryDialog({ value, open, onOpenChange, nextSort }: { value: CategoryRow | null; open: boolean; onOpenChange: (o: boolean) => void; nextSort: number }) {
  const form = useZodForm(categorySchema, { name: "", description: "", color: SWATCHES[0], sortOrder: String(nextSort + 1), isActive: true });
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? { id: value.id, name: value.name, description: value.description ?? "", color: value.color ?? SWATCHES[0], sortOrder: String(value.sortOrder + 1), isActive: value.isActive }
        : { name: "", description: "", color: SWATCHES[nextSort % SWATCHES.length], sortOrder: String(nextSort + 1), isActive: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  // Positions are shown 1-based; stored sort order starts at 0.
  const submit = useFormSubmit(form, (v) => saveCategoryAction({ ...v, sortOrder: String(Math.max(0, Number(v.sortOrder) - 1)) }), {
    success: "Category saved",
    onSuccess: () => onOpenChange(false),
  });
  const color = form.watch("color");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? "Edit category" : "New category"} size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <TextField control={form.control} name="name" label="Name" required autoFocus />
            <TextareaField control={form.control} name="description" label="Description" optional className="[&_textarea]:min-h-[60px]" />
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="sortOrder" label="Position on POS" description="1 is the first tab" inputMode="numeric" />
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Colour</p>
                <div className="flex flex-wrap gap-1.5">
                  {SWATCHES.map((s) => (
                    <button suppressHydrationWarning
                      key={s}
                      type="button"
                      aria-label={`Colour ${s}`}
                      onClick={() => form.setValue("color", s)}
                      className="size-6 rounded-full ring-offset-2 transition-shadow"
                      style={{ background: s, boxShadow: color === s ? `0 0 0 2px #fff, 0 0 0 4px ${s}` : undefined }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <SwitchField control={form.control} name="isActive" label="Visible on POS" />
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

// ─── Modifier groups ────────────────────────────────────────────────────────

interface GroupRow {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  products: number;
  modifiers: { id: string; name: string; price: number; isActive: boolean }[];
}

export function ModifierGroupsPanel({ rows }: { rows: GroupRow[] }) {
  const session = useSession();
  const [editing, setEditing] = React.useState<GroupRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<GroupRow | null>(null);
  const del = useAction(deleteModifierGroupAction, { success: "Modifier group deleted", onSuccess: () => setDeleting(null) });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">Add-ons and choices offered when an item is added on the POS (spice level, extra cheese…).</p>
        {session.can("menu.create") ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add group
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Layers />} title="No modifier groups" description="Create choices like Spice level or Add-ons, then attach them to menu items." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{g.name}</p>
                  <p className="text-xs text-muted">
                    {g.minSelect > 0 ? `Required · choose ${g.minSelect}–${g.maxSelect}` : `Optional · up to ${g.maxSelect}`} · used by {pluralize(g.products, "item")}
                  </p>
                </div>
                <div className="flex gap-1">
                  {session.can("menu.edit") ? (
                    <Button variant="ghost" size="icon-xs" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}>
                      <Pencil />
                    </Button>
                  ) : null}
                  {session.can("menu.delete") ? (
                    <Button variant="ghost" size="icon-xs" aria-label={`Delete ${g.name}`} onClick={() => setDeleting(g)}>
                      <Trash />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.modifiers.filter((m) => m.isActive).map((m) => (
                  <span key={m.id} className="inline-flex h-6 items-center gap-1 rounded-md bg-sunken px-2 text-xs text-ink-2">
                    {m.name}
                    {m.price ? <span className="text-muted">+{formatMoney(m.price)}</span> : null}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      <ModifierGroupDialog value={editing === "new" ? null : editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={`It will be removed from ${deleting?.products ?? 0} menu items. Past orders keep the options customers chose.`}
        confirmLabel="Delete group"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </div>
  );
}

function ModifierGroupDialog({ value, open, onOpenChange }: { value: GroupRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useZodForm(modifierGroupSchema, { name: "", minSelect: "0", maxSelect: "1", modifiers: [{ name: "", price: "0", isActive: true }] });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "modifiers" });
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id,
            name: value.name,
            minSelect: String(value.minSelect),
            maxSelect: String(value.maxSelect),
            modifiers: value.modifiers.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name, price: String(m.price / 100), isActive: true })),
          }
        : { name: "", minSelect: "0", maxSelect: "1", modifiers: [{ name: "", price: "0", isActive: true }] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, saveModifierGroupAction, { success: "Modifier group saved", onSuccess: () => onOpenChange(false) });
  const rootError = form.formState.errors.modifiers?.root?.message ?? form.formState.errors.modifiers?.message;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.name}` : "New modifier group"} size="md">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <TextField control={form.control} name="name" label="Group name" required placeholder="e.g. Spice level" autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="minSelect" label="Minimum choices" description="0 = optional" inputMode="numeric" />
              <TextField control={form.control} name="maxSelect" label="Maximum choices" inputMode="numeric" />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Options</p>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <TextField control={form.control} name={`modifiers.${i}.name`} placeholder="Option name" className="flex-1" />
                    <TextField control={form.control} name={`modifiers.${i}.price`} placeholder="0" prefix="+₹" inputMode="decimal" className="w-[120px]" />
                    <Button variant="ghost" size="icon" aria-label="Remove option" disabled={fields.length <= 1} onClick={() => remove(i)}>
                      <Trash />
                    </Button>
                  </div>
                ))}
              </div>
              {rootError ? <p className="mt-1 text-xs text-danger-700">{rootError}</p> : null}
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => append({ name: "", price: "0", isActive: true })}>
                <Plus /> Add option
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Save group</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


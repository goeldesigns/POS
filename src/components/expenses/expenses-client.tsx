"use client";

import { Ellipsis, Paperclip, Pencil, Plus, Trash, Wallet } from "lucide-react";
import * as React from "react";
import { Controller } from "react-hook-form";
import { SelectField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { AttachmentInput } from "@/components/forms/file-upload";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { toDateInputValue } from "@/lib/validation/helpers";
import { EXPENSE_CATEGORIES, expenseSchema, PAYMENT_METHODS } from "@/lib/validation/operations";
import { deleteExpenseAction, saveExpenseAction } from "@/server/actions/expenses";
import type { ExpenseRow } from "@/server/services/expenses";

export function NewExpenseButton() {
  const session = useSession();
  const { get, set } = useQueryParams();
  const [open, setOpen] = React.useState(get("new") === "1");
  React.useEffect(() => {
    if (get("new") === "1") set({ new: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!session.can("expenses.create")) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Record expense
      </Button>
      <ExpenseDialog open={open} onOpenChange={setOpen} value={null} />
    </>
  );
}

function ExpenseDialog({ open, onOpenChange, value }: { open: boolean; onOpenChange: (o: boolean) => void; value: ExpenseRow | null }) {
  const session = useSession();
  const today = todayISO(session.restaurant.timezone);
  const blank = { title: "", category: "RAW_MATERIALS" as const, amount: "", date: today, paymentMethod: "UPI" as const, vendor: "", notes: "", attachmentUrl: null, attachmentName: null };
  const form = useZodForm(expenseSchema, blank);
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id,
            title: value.title,
            category: value.category,
            amount: String(value.amount / 100),
            date: toDateInputValue(value.date),
            paymentMethod: value.paymentMethod,
            vendor: value.vendor ?? "",
            notes: value.notes ?? "",
            attachmentUrl: value.attachmentUrl,
            attachmentName: value.attachmentName,
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, saveExpenseAction, { success: value ? "Expense updated" : "Expense recorded", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? "Edit expense" : "Record expense"} size="md">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <TextField control={form.control} name="title" label="Expense" required placeholder="e.g. Electricity bill — October" autoFocus />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="amount" label="Amount" required prefix="₹" inputMode="decimal" />
              <SelectField control={form.control} name="category" label="Category" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c]! }))} />
              <TextField control={form.control} name="date" label="Date" required type="date" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField control={form.control} name="paymentMethod" label="Paid via" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m]! }))} />
              <TextField control={form.control} name="vendor" label="Vendor" optional />
            </div>
            <TextareaField control={form.control} name="notes" label="Notes" optional className="[&_textarea]:min-h-[60px]" />
            <Field label="Attachment" optional>
              <Controller
                control={form.control}
                name="attachmentUrl"
                render={({ field }) => (
                  <AttachmentInput
                    value={field.value ?? null}
                    name={form.watch("attachmentName") ?? null}
                    onChange={(v) => {
                      field.onChange(v.url);
                      form.setValue("attachmentName", v.name);
                    }}
                  />
                )}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{value ? "Save changes" : "Record expense"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesTable({ rows, total, page, pageSize }: { rows: ExpenseRow[]; total: number; page: number; pageSize: number }) {
  const session = useSession();
  const tz = session.restaurant.timezone;
  const [editing, setEditing] = React.useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = React.useState<ExpenseRow | null>(null);
  const del = useAction(deleteExpenseAction, { success: "Expense deleted", onSuccess: () => setDeleting(null) });
  const columns: Column<ExpenseRow>[] = [
    { key: "date", header: "Date", sortable: true, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date, "UTC")}</span> },
    {
      key: "title",
      header: "Expense",
      cell: (r) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            {r.title}
            {r.attachmentUrl ? (
              <a href={r.attachmentUrl} target="_blank" rel="noreferrer" aria-label="Open attachment" className="text-muted hover:text-brand-500" onClick={(e) => e.stopPropagation()}>
                <Paperclip className="size-3.5" />
              </a>
            ) : null}
          </p>
          {r.notes ? <p className="line-clamp-1 text-xs text-muted">{r.notes}</p> : null}
        </div>
      ),
    },
    { key: "category", header: "Category", cell: (r) => <Badge>{EXPENSE_CATEGORY_LABEL[r.category]}</Badge> },
    { key: "vendor", header: "Vendor", hideBelow: "md", cell: (r) => r.vendor ?? <span className="text-subtle">—</span> },
    { key: "method", header: "Paid via", hideBelow: "lg", cell: (r) => PAYMENT_METHOD_LABEL[r.paymentMethod] },
    { key: "amount", header: "Amount", sortable: true, align: "right", cell: (r) => <span className="font-semibold">{formatMoney(r.amount)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        session.can("expenses.edit") || session.can("expenses.delete") ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Expense actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {session.can("expenses.edit") ? (
                <DropdownMenuItem onSelect={() => setEditing(r)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
              ) : null}
              {session.can("expenses.delete") ? (
                <DropdownMenuItem tone="danger" onSelect={() => setDeleting(r)}>
                  <Trash /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];
  void tz;
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        empty={<EmptyState icon={<Wallet />} title="No expenses in this period" description="Record rent, salaries, utilities and supplier payments to see your true profit." />}
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <ExpenseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} value={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this expense?"
        description={`${deleting?.title} · ${deleting ? formatMoney(deleting.amount) : ""}. This can't be undone.`}
        confirmLabel="Delete"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </>
  );
}

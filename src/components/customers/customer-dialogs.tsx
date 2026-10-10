"use client";

import { Download, FileUp, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { parseCsvObjects } from "@/lib/csv";
import { pluralize } from "@/lib/utils";
import { customerSchema } from "@/lib/validation/operations";
import { toDateInputValue } from "@/lib/validation/helpers";
import { adjustPointsAction, importCustomersAction, saveCustomerAction } from "@/server/actions/customers";

export interface CustomerFormValue {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  anniversary?: string | null;
  tags: string[];
  address?: { line1: string; city: string; postalCode: string | null } | null;
}

export function CustomerDialog({ open, onOpenChange, value, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; value: CustomerFormValue | null; onSaved?: (id: string) => void }) {
  const blank = { name: "", phone: "", email: "", birthday: "", anniversary: "", tags: "", addressLine1: "", addressCity: "", addressPostalCode: "" };
  const form = useZodForm(customerSchema, blank);
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id,
            name: value.name,
            phone: value.phone,
            email: value.email ?? "",
            birthday: toDateInputValue(value.birthday),
            anniversary: toDateInputValue(value.anniversary ?? null),
            tags: value.tags.join(", "),
            addressLine1: value.address?.line1 ?? "",
            addressCity: value.address?.city ?? "",
            addressPostalCode: value.address?.postalCode ?? "",
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, saveCustomerAction, {
    success: value ? "Customer updated" : "Customer added",
    onSuccess: (r) => {
      onOpenChange(false);
      onSaved?.(r.id);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.name}` : "Add customer"} size="md">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Full name" required autoFocus />
              <TextField control={form.control} name="phone" label="Phone" required inputMode="tel" />
              <TextField control={form.control} name="email" label="Email" optional type="email" />
              <TextField control={form.control} name="tags" label="Tags" optional placeholder="VIP, Regular, Corporate" description="Comma separated" />
              <TextField control={form.control} name="birthday" label="Birthday" optional type="date" description="Used for birthday loyalty bonus" />
              <TextField control={form.control} name="anniversary" label="Anniversary" optional type="date" />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Default delivery address <span className="font-normal text-subtle">Optional</span></p>
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_120px]">
                <TextField control={form.control} name="addressLine1" placeholder="Flat, building, street" />
                <TextField control={form.control} name="addressCity" placeholder="City" />
                <TextField control={form.control} name="addressPostalCode" placeholder="PIN code" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{value ? "Save changes" : "Add customer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ImportCustomersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = React.useState<{ name: string; phone: string; email?: string; birthday?: string; tags?: string }[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const router = useRouter();
  const run = useAction(importCustomersAction, { onSuccess: (r) => { setResult(r); router.refresh(); } });

  React.useEffect(() => {
    if (!open) {
      setRows([]);
      setFileName(null);
      setResult(null);
    }
  }, [open]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const objects = parseCsvObjects(text);
    setFileName(file.name);
    setRows(
      objects.map((o) => ({
        name: o.name ?? o.full_name ?? o.customer_name ?? "",
        phone: o.phone ?? o.mobile ?? o.phone_number ?? "",
        email: o.email ?? "",
        birthday: o.birthday ?? o.dob ?? "",
        tags: o.tags ?? "",
      })),
    );
  };

  const template = () => {
    const blob = new Blob(["name,phone,email,birthday,tags\nAnanya Iyer,9845012345,ananya@example.com,1994-06-12,VIP;Regular\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "customers-template.csv";
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import customers" description="Upload a CSV with name and phone columns. Existing phone numbers are updated, not duplicated." size="md">
        <DialogBody className="space-y-4">
          {result ? (
            <InlineAlert tone={result.skipped ? "warning" : "success"} title={`${result.created} added · ${result.updated} updated${result.skipped ? ` · ${result.skipped} skipped` : ""}`}>
              {result.errors.length ? (
                <ul className="mt-1 list-disc pl-4">
                  {result.errors.slice(0, 5).map((e) => (
                    <li key={e.row}>Row {e.row}: {e.message}</li>
                  ))}
                </ul>
              ) : (
                "All rows imported."
              )}
            </InlineAlert>
          ) : (
            <>
              <Field label="CSV file" description="Columns: name, phone, email, birthday (YYYY-MM-DD), tags">
                <Input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="pt-1.5" />
              </Field>
              <Button variant="ghost" size="sm" onClick={template}>
                <Download /> Download template
              </Button>
              {fileName ? (
                rows.length ? (
                  <div className="rounded-xl border border-line">
                    <p className="border-b border-line px-3 py-2 text-xs text-muted">
                      {fileName} · {pluralize(rows.length, "row")} · preview
                    </p>
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-b border-line last:border-0">
                            <td className="px-3 py-1.5 text-ink">{r.name || <span className="text-danger">missing</span>}</td>
                            <td className="px-3 py-1.5 text-muted">{r.phone}</td>
                            <td className="px-3 py-1.5 text-muted">{r.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <InlineAlert tone="warning" icon={<TriangleAlert />}>No rows found. Make sure the first line has column headers.</InlineAlert>
                )
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{result ? "Close" : "Cancel"}</Button>
          {!result ? (
            <Button disabled={!rows.length} loading={run.pending} onClick={() => run.execute({ rows })}>
              <FileUp /> Import {rows.length ? rows.length : ""} customers
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustPointsDialog({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (o: boolean) => void; customer: { id: string; name: string; balance: number } | null }) {
  const [points, setPoints] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setPoints("");
      setReason("");
    }
  }, [open]);
  const run = useAction(adjustPointsAction, { success: (r) => `New balance: ${r.balance} points`, onSuccess: () => onOpenChange(false) });
  if (!customer) return null;
  const n = Number(points);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adjust points" description={`${customer.name} has ${customer.balance} points`} size="sm">
        <DialogBody className="space-y-3">
          <Field label="Points" description="Use a negative number to deduct, e.g. -50">
            <Input autoFocus inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, ""))} />
          </Field>
          <Field label="Reason" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill for delayed order" maxLength={160} />
          </Field>
          {n && customer.balance + n < 0 ? <p className="text-xs text-danger-700">The balance can't go below zero.</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!n || !reason.trim() || customer.balance + n < 0} loading={run.pending} onClick={() => run.execute({ customerId: customer.id, points, reason: reason.trim() })}>
            Apply {n > 0 ? `+${n}` : n || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

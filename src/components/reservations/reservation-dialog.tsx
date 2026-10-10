"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import * as React from "react";
import { CheckboxField, SelectField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { apiFetch } from "@/lib/api-client";
import { formatPhone } from "@/lib/format";
import { reservationSchema, RESERVATION_STATUSES } from "@/lib/validation/operations";
import { RESERVATION_STATUS } from "@/lib/labels";
import { saveReservationAction } from "@/server/actions/reservations";

export interface ReservationFormValue {
  id?: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  date: string;
  time: string;
  partySize: number;
  durationMinutes: number;
  tableId: string | null;
  status: string;
  source: string;
  notes: string | null;
}

const SOURCES = ["Phone", "Walk-in", "Website", "Google", "Instagram", "Zomato", "Other"];

export function ReservationDialog({
  open,
  onOpenChange,
  value,
  tables,
  defaultDate,
  defaultDuration,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: ReservationFormValue | null;
  tables: { id: string; name: string; capacity: number; floor: string }[];
  defaultDate: string;
  defaultDuration: number;
}) {
  const blank = {
    customerId: null,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    date: defaultDate,
    time: "20:00",
    partySize: "2",
    durationMinutes: String(defaultDuration),
    tableId: "",
    status: "CONFIRMED" as const,
    source: "Phone",
    notes: "",
    saveCustomer: true,
  };
  const form = useZodForm(reservationSchema, blank);
  const [lookup, setLookup] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setLookup("");
    form.reset(
      value
        ? {
            id: value.id,
            customerId: value.customerId,
            customerName: value.customerName,
            customerPhone: value.customerPhone,
            customerEmail: value.customerEmail ?? "",
            date: value.date,
            time: value.time,
            partySize: String(value.partySize),
            durationMinutes: String(value.durationMinutes),
            tableId: value.tableId ?? "",
            status: value.status as (typeof RESERVATION_STATUSES)[number],
            source: value.source,
            notes: value.notes ?? "",
            saveCustomer: false,
          }
        : { ...blank, date: defaultDate },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const party = Number(form.watch("partySize")) || 0;
  const customerId = form.watch("customerId");
  const { data: hits = [] } = useQuery({
    queryKey: ["res-customer", lookup],
    queryFn: () => apiFetch<{ id: string; name: string; phone: string; email: string | null }[]>(`/api/v1/customers/search?q=${encodeURIComponent(lookup)}`),
    enabled: open && lookup.trim().length >= 3,
  });

  const submit = useFormSubmit(form, saveReservationAction, {
    success: value?.id ? "Reservation updated" : "Reservation created",
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value?.id ? "Edit reservation" : "New reservation"} size="lg">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-5">
            {!value?.id ? (
              <div className="relative">
                <Input
                  prefix={<Search />}
                  placeholder="Find an existing guest by phone or name"
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                />
                {hits.length && lookup.length >= 3 ? (
                  <ul className="absolute inset-x-0 top-10 z-10 rounded-xl border border-line bg-surface p-1 shadow-pop">
                    {hits.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <button suppressHydrationWarning
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-canvas"
                          onClick={() => {
                            form.setValue("customerId", c.id);
                            form.setValue("customerName", c.name);
                            form.setValue("customerPhone", c.phone);
                            form.setValue("customerEmail", c.email ?? "");
                            setLookup("");
                          }}
                        >
                          <span className="font-medium text-ink">{c.name}</span>
                          <span className="text-muted">{formatPhone(c.phone)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="customerName" label="Guest name" required />
              <TextField control={form.control} name="customerPhone" label="Phone" required inputMode="tel" />
              <TextField control={form.control} name="customerEmail" label="Email" optional type="email" />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <TextField control={form.control} name="date" label="Date" required type="date" />
              <TextField control={form.control} name="time" label="Time" required type="time" step={900} />
              <TextField control={form.control} name="partySize" label="Guests" required inputMode="numeric" />
              <SelectField
                control={form.control}
                name="durationMinutes"
                label="Duration"
                options={[60, 90, 120, 150, 180].map((m) => ({ value: String(m), label: `${m / 60 >= 1 ? `${Math.floor(m / 60)}h` : ""}${m % 60 ? ` ${m % 60}m` : ""}`.trim() }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                control={form.control}
                name="tableId"
                label="Table"
                placeholder="Assign later"
                options={tables
                  .filter((t) => !party || t.capacity >= party)
                  .map((t) => ({ value: t.id, label: `${t.name} · ${t.capacity} seats · ${t.floor}` }))}
                description={party ? `Showing tables for ${party}+` : undefined}
              />
              <SelectField control={form.control} name="status" label="Status" options={RESERVATION_STATUSES.map((s) => ({ value: s, label: RESERVATION_STATUS[s]!.label }))} />
              <SelectField control={form.control} name="source" label="Booked via" options={SOURCES.map((s) => ({ value: s, label: s }))} />
            </div>
            <TextareaField control={form.control} name="notes" label="Notes" optional placeholder="Occasion, seating preference, dietary needs…" className="[&_textarea]:min-h-[64px]" />
            {!customerId && !value?.id ? <CheckboxField control={form.control} name="saveCustomer" label="Save this guest to Customers" /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{value?.id ? "Save changes" : "Create reservation"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

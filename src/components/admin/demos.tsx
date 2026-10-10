"use client";

import { Ban, Building, CalendarCheck, CalendarClock, CircleCheck, Copy, ExternalLink, Mail, Phone, Trash, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { CheckboxField, SelectField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { ConfirmDialog, Sheet, SheetContent } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { DEMO, DEMO_STATUS, formatDemoDate, formatSlot, type DemoStatusValue } from "@/lib/demo";
import { formatDateTime, formatRelative } from "@/lib/format";
import { PLATFORM_TZ } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { RESTAURANT_TYPES } from "@/lib/validation/platform";
import { updateDemoSchema } from "@/lib/validation/demo";
import { deleteDemoAction, setDemoStatusAction, updateDemoAction } from "@/server/actions/platform";
import type { DemoRow } from "@/server/services/demos";

function relativeDay(iso: string) {
  const start = new Date(iso).getTime();
  const days = Math.round((start - Date.now()) / 86_400_000);
  if (start < Date.now()) return Date.now() - start < 3_600_000 ? "In progress" : "Past";
  const hours = Math.round((start - Date.now()) / 3_600_000);
  if (hours < 24) return hours <= 1 ? "Within the hour" : `In ${hours} hours`;
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

export function DemosTable({
  rows,
  total,
  page,
  pageSize,
  filtered,
  admins,
}: {
  rows: DemoRow[];
  total: number;
  page: number;
  pageSize: number;
  filtered: boolean;
  admins: { id: string; name: string }[];
}) {
  const { get } = useQueryParams();
  // Local state opens the panel instantly; the URL is kept in sync for deep links.
  const [openId, setOpenId] = React.useState<string | null>(get("open"));
  const open = rows.find((r) => r.id === openId) ?? null;
  const show = (id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("open", id);
    else url.searchParams.delete("open");
    window.history.replaceState(null, "", url);
  };

  const columns: Column<DemoRow>[] = [
    {
      key: "scheduledAt",
      header: "When (IST)",
      sortable: true,
      cell: (d) => (
        <div className="min-w-[150px]">
          <p className="font-medium whitespace-nowrap text-ink">
            {formatDemoDate(d.date)} · {formatSlot(d.time)}
          </p>
          <p className={cn("text-xs", relativeDay(d.scheduledAt) === "Past" ? "text-subtle" : "text-brand-600")}>
            {relativeDay(d.scheduledAt)} · {d.durationMinutes} min
          </p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (d) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <Avatar name={d.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{d.name}</p>
            <p className="truncate text-xs text-muted">{d.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "restaurantName",
      header: "Restaurant",
      sortable: true,
      cell: (d) => (
        <div className="min-w-[160px]">
          <p className="truncate text-ink">{d.restaurantName}</p>
          <p className="truncate text-xs text-muted">
            {[d.city, `${d.outlets} outlet${d.outlets === 1 ? "" : "s"}`, d.restaurantType].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (d) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge dict={DEMO_STATUS} value={d.status} size="sm" />
          {d.restaurant ? (
            <Badge size="sm" tone="success">
              Customer
            </Badge>
          ) : null}
        </div>
      ),
    },
    { key: "assigned", header: "Owner", hideBelow: "lg", cell: (d) => (d.assignedTo ? <span className="text-ink-2">{d.assignedTo.name}</span> : <span className="text-subtle">Unassigned</span>) },
    {
      key: "createdAt",
      header: "Requested",
      sortable: true,
      hideBelow: "xl",
      cell: (d) => (
        <span className="whitespace-nowrap text-ink-2" title={formatDateTime(d.createdAt, PLATFORM_TZ)}>
          {formatRelative(d.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(d) => d.id}
        onRowClick={(d) => show(d.id)}
        selectedId={openId}
        empty={
          <EmptyState
            icon={<CalendarClock />}
            title={filtered ? "No demo requests match" : "No demo requests here yet"}
            description={filtered ? "Try another status, search or date range." : "Bookings from the website's “Book a demo” section land here."}
          />
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <Sheet open={!!open} onOpenChange={(o) => !o && show(null)}>
        {open ? <DemoPanel key={open.id + open.updatedAt} demo={open} admins={admins} onClose={() => show(null)} /> : null}
      </Sheet>
    </>
  );
}

const QUICK: { status: DemoStatusValue; label: string; icon: React.ReactNode; when: DemoStatusValue[] }[] = [
  { status: "CONFIRMED", label: "Confirm", icon: <CalendarCheck />, when: ["NEW", "CANCELLED", "NO_SHOW"] },
  { status: "COMPLETED", label: "Mark completed", icon: <CircleCheck />, when: ["NEW", "CONFIRMED", "NO_SHOW"] },
  { status: "NO_SHOW", label: "No-show", icon: <UserX />, when: ["CONFIRMED", "NEW"] },
  { status: "CANCELLED", label: "Cancel", icon: <Ban />, when: ["NEW", "CONFIRMED"] },
];

function DemoPanel({ demo, admins, onClose }: { demo: DemoRow; admins: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const defaults = {
    id: demo.id,
    date: demo.date,
    time: demo.time,
    durationMinutes: String(demo.durationMinutes),
    status: demo.status,
    name: demo.name,
    email: demo.email,
    phone: demo.phone,
    restaurantName: demo.restaurantName,
    city: demo.city ?? "",
    outlets: String(demo.outlets),
    restaurantType: (demo.restaurantType ?? "") as never,
    currentSystem: demo.currentSystem ?? "",
    message: demo.message ?? "",
    meetingLink: demo.meetingLink ?? "",
    adminNotes: demo.adminNotes ?? "",
    assignedToId: demo.assignedTo?.id ?? "",
    notifyCustomer: false,
  };
  const form = useZodForm(updateDemoSchema, defaults);
  const submit = useFormSubmit(form, updateDemoAction, {
    success: (r) => (r.notified ? "Demo updated — customer emailed" : "Demo updated"),
    onSuccess: () => router.refresh(),
  });
  const quick = useAction(setDemoStatusAction, { success: "Status updated", onSuccess: () => router.refresh() });
  const remove = useAction(deleteDemoAction, {
    success: "Demo request deleted",
    onSuccess: () => {
      setDeleting(false);
      onClose();
      router.refresh();
    },
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <SheetContent
      width="lg"
      title={demo.restaurantName}
      description={`${formatDemoDate(demo.date, { year: true })} · ${formatSlot(demo.time)} ${DEMO.timezoneLabel} · requested ${formatRelative(demo.createdAt)}`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-4 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge dict={DEMO_STATUS} value={demo.status} />
            {demo.restaurant ? (
              <Link href={`/super-admin/restaurants/${demo.restaurant.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-success-700 hover:underline">
                <Building className="size-3.5" /> Customer: {demo.restaurant.name}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK.filter((q) => q.when.includes(demo.status as DemoStatusValue)).map((q) => (
              <Button key={q.status} size="sm" variant={q.status === "CONFIRMED" ? "primary" : "outline"} loading={quick.pending} onClick={() => quick.execute({ id: demo.id, status: q.status })}>
                {q.icon} {q.label}
              </Button>
            ))}
            {!demo.restaurant ? (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/super-admin/restaurants/new?demo=${demo.id}`}>
                  <Building /> Create restaurant
                </Link>
              </Button>
            ) : null}
          </div>
          <dl className="grid gap-3 rounded-xl border border-line p-3.5 text-[13px] sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted">Contact</dt>
              <dd className="mt-0.5 font-medium text-ink">{demo.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted">Phone</dt>
              <dd className="mt-0.5 flex items-center gap-1.5">
                <a href={`tel:${demo.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand-600">
                  <Phone className="size-3.5" /> {demo.phone}
                </a>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs text-muted">Email</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                <a href={`mailto:${demo.email}`} className="inline-flex min-w-0 items-center gap-1 truncate font-medium text-ink hover:text-brand-600">
                  <Mail className="size-3.5 shrink-0" /> {demo.email}
                </a>
                <button suppressHydrationWarning type="button" onClick={() => void copy(demo.email)} className="rounded p-1 text-subtle hover:bg-sunken hover:text-ink" aria-label="Copy email">
                  <Copy className="size-3.5" />
                </button>
              </dd>
            </div>
            {demo.message ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Their note</dt>
                <dd className="mt-0.5 whitespace-pre-line text-ink-2">{demo.message}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <form id="demo-edit" onSubmit={submit} noValidate className="space-y-5 px-5 py-4">
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-ink">Schedule</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField control={form.control} name="date" label="Date" type="date" />
              <TextField control={form.control} name="time" label={`Time (${DEMO.timezoneLabel})`} type="time" step={300} />
              <SelectField
                control={form.control}
                name="durationMinutes"
                label="Duration"
                options={[15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }))}
              />
              <SelectField
                control={form.control}
                name="status"
                label="Status"
                options={Object.entries(DEMO_STATUS).map(([value, s]) => ({ value, label: s.label }))}
              />
              <SelectField
                control={form.control}
                name="assignedToId"
                label="Owner"
                placeholder="Unassigned"
                options={admins.map((a) => ({ value: a.id, label: a.name }))}
                className="sm:col-span-2"
              />
              <div className="sm:col-span-3">
                <TextField control={form.control} name="meetingLink" label="Meeting link" optional placeholder="https://meet.google.com/…" />
                {demo.meetingLink ? (
                  <a href={demo.meetingLink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    Open link <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-ink">Lead details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Name" required />
              <TextField control={form.control} name="phone" label="Phone" required />
              <TextField control={form.control} name="email" label="Email" required type="email" className="sm:col-span-2" />
              <TextField control={form.control} name="restaurantName" label="Restaurant" required />
              <TextField control={form.control} name="city" label="City" optional />
              <TextField control={form.control} name="outlets" label="Outlets" inputMode="numeric" />
              <SelectField
                control={form.control}
                name="restaurantType"
                label="Type"
                placeholder="Not specified"
                options={RESTAURANT_TYPES.map((t) => ({ value: t, label: t }))}
              />
              <TextField control={form.control} name="currentSystem" label="Current POS" optional className="sm:col-span-2" />
              <TextareaField control={form.control} name="message" label="Their note" optional rows={2} className="sm:col-span-2" />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold text-ink">Internal notes</h3>
            <TextareaField control={form.control} name="adminNotes" placeholder="Only visible to the platform team — call notes, objections, next steps…" rows={4} />
          </section>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3">
        {!demo.restaurant ? (
          <Button type="button" variant="ghost" size="sm" className="text-danger-700 hover:bg-danger-50 hover:text-danger-700" onClick={() => setDeleting(true)}>
            <Trash /> Delete
          </Button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <CheckboxField control={form.control} name="notifyCustomer" label="Email the customer about changes" />
          <Button type="submit" form="demo-edit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this demo request?"
        description="Use this for spam or duplicates. The deletion is recorded in the audit log."
        confirmLabel="Delete"
        loading={remove.pending}
        onConfirm={() => remove.execute({ id: demo.id })}
      />
    </SheetContent>
  );
}

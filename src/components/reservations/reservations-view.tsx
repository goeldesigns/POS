"use client";

import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Ellipsis, List, Phone, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Card, EmptyState, StatusBadge } from "@/components/ui/display";
import { DataTable, FilterSelect, SearchParamInput, TableCard, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page-header";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatDate, formatPhone, formatTime } from "@/lib/format";
import { RESERVATION_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { setReservationStatusAction } from "@/server/actions/reservations";
import { ReservationDialog, type ReservationFormValue } from "./reservation-dialog";

export interface ResItem {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startsAt: string;
  localDate: string;
  localTime: string;
  durationMinutes: number;
  partySize: number;
  status: string;
  source: string;
  notes: string | null;
  table: { id: string; name: string } | null;
  repeatGuest: boolean;
}

const DOT: Record<string, string> = {
  PENDING: "bg-warning",
  CONFIRMED: "bg-brand-500",
  SEATED: "bg-info",
  COMPLETED: "bg-success",
  CANCELLED: "bg-subtle",
  NO_SHOW: "bg-danger",
};

export function ReservationsView({
  view,
  items,
  month,
  selectedDate,
  today,
  tables,
  defaultDuration,
}: {
  view: "calendar" | "list";
  items: ResItem[];
  month: string;
  selectedDate: string;
  today: string;
  tables: { id: string; name: string; capacity: number; floor: string }[];
  defaultDuration: number;
}) {
  const session = useSession();
  const { set, get } = useQueryParams();
  const router = useRouter();
  const tz = session.restaurant.timezone;
  const [editing, setEditing] = React.useState<ReservationFormValue | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(get("new") === "1");
  const status = useAction(setReservationStatusAction, { success: "Reservation updated" });
  const canCreate = session.can("reservations.create");

  React.useEffect(() => {
    if (get("new") === "1") set({ new: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (r: ResItem) => {
    setEditing({
      id: r.id, customerId: r.customerId, customerName: r.customerName, customerPhone: r.customerPhone, customerEmail: r.customerEmail,
      date: r.localDate, time: r.localTime, partySize: r.partySize, durationMinutes: r.durationMinutes, tableId: r.table?.id ?? null,
      status: r.status, source: r.source, notes: r.notes,
    });
    setDialogOpen(true);
  };

  const actions = (r: ResItem) => (
    <ResActions r={r} canEdit={session.can("reservations.edit")} canCancel={session.can("reservations.cancel")} onEdit={() => openEdit(r)} onStatus={(s) => status.execute({ id: r.id, status: s as never })} onSeat={() => router.push(r.table ? `/app/pos?table=${r.table.id}` : "/app/tables")} />
  );

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Bookings, check-ins and table allocation."
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => set({ view: v === "calendar" ? null : v })}
              options={[
                { value: "calendar", label: "Calendar", icon: <CalendarDays /> },
                { value: "list", label: "List", icon: <List /> },
              ]}
            />
            {canCreate ? (
              <Button onClick={openNew}>
                <CalendarPlus /> New reservation
              </Button>
            ) : null}
          </>
        }
      />

      {view === "calendar" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <MonthGrid month={month} items={items} selected={selectedDate} today={today} tz={tz} onSelect={(d) => set({ date: d })} onMonth={(m) => set({ month: m, date: null })} />
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[15px] font-semibold text-ink">{formatDate(`${selectedDate}T12:00:00Z`, "UTC")}</p>
                <p className="text-xs text-muted">
                  {dayItems(items, selectedDate).filter((r) => !["CANCELLED", "NO_SHOW"].includes(r.status)).reduce((s, r) => s + r.partySize, 0)} covers booked
                </p>
              </div>
              {selectedDate !== today ? (
                <Button variant="ghost" size="sm" onClick={() => set({ date: null, month: null })}>
                  Today
                </Button>
              ) : null}
            </div>
            <Agenda items={dayItems(items, selectedDate)} actions={actions} tz={tz} onNew={canCreate ? openNew : undefined} />
          </Card>
        </div>
      ) : (
        <TableCard
          toolbar={
            <>
              <SearchParamInput placeholder="Search guest name or phone" />
              <FilterSelect
                param="period"
                allLabel="Upcoming"
                options={[
                  { value: "today", label: "Today" },
                  { value: "past", label: "Past 30 days" },
                  { value: "all", label: "All" },
                ]}
              />
              <FilterSelect param="status" allLabel="All statuses" options={Object.entries(RESERVATION_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
            </>
          }
        >
          <DataTable
            columns={listColumns(tz, actions)}
            rows={items}
            getRowId={(r) => r.id}
            empty={
              <EmptyState
                icon={<CalendarDays />}
                title="No reservations yet"
                description="Create your first reservation to start managing your dining schedule."
                action={canCreate ? <Button size="sm" onClick={openNew}><CalendarPlus /> Add reservation</Button> : null}
              />
            }
          />
        </TableCard>
      )}

      <ReservationDialog open={dialogOpen} onOpenChange={setDialogOpen} value={editing} tables={tables} defaultDate={selectedDate} defaultDuration={defaultDuration} />
    </>
  );
}

function dayItems(items: ResItem[], date: string) {
  return items.filter((r) => r.localDate === date).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function listColumns(tz: string, actions: (r: ResItem) => React.ReactNode): Column<ResItem>[] {
  return [
    {
      key: "startsAt",
      header: "When",
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{formatDate(r.startsAt, tz)}</p>
          <p className="text-xs text-muted">{formatTime(r.startsAt, tz)} · {r.durationMinutes} min</p>
        </div>
      ),
    },
    {
      key: "guest",
      header: "Guest",
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{r.customerName}</p>
          <p className="text-xs text-muted">{formatPhone(r.customerPhone)}</p>
        </div>
      ),
    },
    { key: "party", header: "Guests", align: "right", cell: (r) => r.partySize },
    { key: "table", header: "Table", cell: (r) => r.table?.name ?? <span className="text-subtle">Unassigned</span> },
    { key: "source", header: "Source", hideBelow: "lg", cell: (r) => r.source },
    { key: "notes", header: "Notes", hideBelow: "xl", cell: (r) => <span className="line-clamp-1 max-w-[220px] text-muted">{r.notes ?? "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge dict={RESERVATION_STATUS} value={r.status} /> },
    { key: "actions", header: "", align: "right", cell: actions },
  ];
}

/** "7pm", "1:30pm" — fits a calendar cell. */
function shortTime(d: string, tz: string) {
  return formatTime(d, tz)
    .replace(":00", "")
    .replace(/\s*([AP])M$/, (_, m: string) => `${m.toLowerCase()}m`);
}

function MonthGrid({
  month,
  items,
  selected,
  today,
  tz,
  onSelect,
  onMonth,
}: {
  month: string;
  items: ResItem[];
  selected: string;
  today: string;
  tz: string;
  onSelect: (d: string) => void;
  onMonth: (m: string) => void;
}) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, 1 - offset + i));
    return { iso: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
  });
  const byDay = new Map<string, ResItem[]>();
  for (const r of items) byDay.set(r.localDate, [...(byDay.get(r.localDate) ?? []), r]);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    onMonth(d.toISOString().slice(0, 7));
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[15px] font-semibold text-ink">{first.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line bg-canvas/60 text-center text-2xs font-medium tracking-wide text-muted uppercase">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c) => {
          const list = (byDay.get(c.iso) ?? []).filter((r) => r.status !== "CANCELLED");
          const covers = list.filter((r) => r.status !== "NO_SHOW").reduce((s, r) => s + r.partySize, 0);
          return (
            <button suppressHydrationWarning
              key={c.iso}
              type="button"
              onClick={() => onSelect(c.iso)}
              className={cn(
                "flex min-h-[92px] flex-col items-stretch border-r border-b border-line p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0",
                !c.inMonth && "bg-canvas/60 text-subtle",
                c.iso === selected ? "bg-brand-50 ring-1 ring-brand-300 ring-inset" : "hover:bg-canvas",
              )}
            >
              <span className={cn("grid size-6 place-items-center rounded-full text-xs font-medium", c.iso === today ? "bg-brand-500 text-white" : c.inMonth ? "text-ink" : "")}>
                {c.day}
              </span>
              {list.length ? (
                <span className="mt-1 space-y-0.5">
                  {list.slice(0, 2).map((r) => (
                    <span key={r.id} className="flex items-center gap-1 truncate text-2xs text-ink-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[r.status])} />
                      {shortTime(r.startsAt, tz)} {r.customerName.split(" ")[0]}
                    </span>
                  ))}
                  {list.length > 2 ? <span className="block text-2xs text-muted">+{list.length - 2} more · {covers} covers</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Agenda({ items, actions, tz, onNew }: { items: ResItem[]; actions: (r: ResItem) => React.ReactNode; tz: string; onNew?: () => void }) {
  if (!items.length) {
    return (
      <EmptyState
        compact
        icon={<CalendarDays />}
        title="No reservations this day"
        description="Create a reservation to start managing the dining schedule."
        action={onNew ? <Button size="sm" onClick={onNew}><CalendarPlus /> Add reservation</Button> : null}
      />
    );
  }
  return (
    <ul className="max-h-[640px] divide-y divide-line overflow-y-auto scrollbar-thin">
      {items.map((r) => (
        <li key={r.id} className={cn("flex gap-3 px-4 py-3", ["CANCELLED", "NO_SHOW"].includes(r.status) && "opacity-60")}>
          <div className="w-14 shrink-0 pt-0.5 text-right">
            <p className="text-[13px] font-semibold text-ink">{formatTime(r.startsAt, tz).replace(" ", " ")}</p>
            <p className="text-2xs text-muted">{r.durationMinutes}m</p>
          </div>
          <div className={cn("w-1 shrink-0 rounded-full", DOT[r.status])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-ink">
                {r.customerName}
                {r.repeatGuest ? <span className="ml-1.5 text-2xs font-medium text-brand-600">Regular</span> : null}
              </p>
              {actions(r)}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1"><Users className="size-3" />{r.partySize}</span>
              <span>{r.table ? `Table ${r.table.name}` : "No table"}</span>
              <span className="inline-flex items-center gap-1"><Phone className="size-3" />{formatPhone(r.customerPhone)}</span>
            </p>
            {r.notes ? <p className="mt-1 line-clamp-2 text-xs text-ink-2">{r.notes}</p> : null}
            <div className="mt-1.5">
              <StatusBadge dict={RESERVATION_STATUS} value={r.status} size="sm" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ResActions({
  r,
  canEdit,
  canCancel,
  onEdit,
  onStatus,
  onSeat,
}: {
  r: ResItem;
  canEdit: boolean;
  canCancel: boolean;
  onEdit: () => void;
  onStatus: (s: string) => void;
  onSeat: () => void;
}) {
  const closed = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(r.status);
  if (!canEdit && !canCancel) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Reservation actions">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        {canEdit && !closed ? (
          <>
            {r.status === "PENDING" ? <DropdownMenuItem onSelect={() => onStatus("CONFIRMED")}>Confirm booking</DropdownMenuItem> : null}
            {r.status !== "SEATED" ? <DropdownMenuItem onSelect={() => onStatus("SEATED")}>Check in (seat guests)</DropdownMenuItem> : null}
            {r.status === "SEATED" ? <DropdownMenuItem onSelect={onSeat}>Start order for table</DropdownMenuItem> : null}
            {r.status === "SEATED" ? <DropdownMenuItem onSelect={() => onStatus("COMPLETED")}>Mark completed</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={onEdit}>Edit / assign table</DropdownMenuItem>
            {r.status !== "SEATED" ? <DropdownMenuItem onSelect={() => onStatus("NO_SHOW")}>Mark no-show</DropdownMenuItem> : null}
          </>
        ) : null}
        {canCancel && !closed ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem tone="danger" onSelect={() => onStatus("CANCELLED")}>
              Cancel reservation
            </DropdownMenuItem>
          </>
        ) : null}
        {closed && canEdit ? <DropdownMenuItem onSelect={onEdit}>View details</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

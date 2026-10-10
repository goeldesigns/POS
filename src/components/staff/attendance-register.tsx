"use client";

import { CalendarCheck, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { ATTENDANCE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { markAllPresentAction, markAttendanceAction } from "@/server/actions/staff";

export interface AttendanceRow {
  staffId: string;
  name: string;
  roleTitle: string;
  status: string | null;
  clockIn: string | null;
  clockOut: string | null;
}

const STATUSES = ["PRESENT", "LATE", "HALF_DAY", "LEAVE", "ABSENT"] as const;
const ACTIVE: Record<string, string> = {
  PRESENT: "bg-success text-white border-success",
  LATE: "bg-warning text-white border-warning",
  HALF_DAY: "bg-info text-white border-info",
  LEAVE: "bg-ink-2 text-white border-ink-2",
  ABSENT: "bg-danger text-white border-danger",
};

export function AttendanceRegister({ date, rows }: { date: string; rows: AttendanceRow[] }) {
  const session = useSession();
  const { set } = useQueryParams();
  const canEdit = session.can("staff.edit");
  const mark = useAction(markAttendanceAction);
  const all = useAction(markAllPresentAction, { success: (r) => (r.marked ? `${r.marked} marked present` : "Everyone is already marked") });
  const shift = (days: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    set({ date: d.toISOString().slice(0, 10) });
  };
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <Input type="date" value={date} onChange={(e) => e.target.value && set({ date: e.target.value })} className="w-[160px]" />
        <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <div className="ml-2 flex flex-wrap gap-3 text-xs text-muted">
          {STATUSES.map((s) => (
            <span key={s}>
              {ATTENDANCE_STATUS[s]!.label}: <span className="font-semibold text-ink">{counts[s]}</span>
            </span>
          ))}
          <span>Unmarked: <span className="font-semibold text-ink">{rows.filter((r) => !r.status).length}</span></span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            title="Everyone's attendance for this month as a PDF"
            onClick={() => window.open(`/print/attendance?month=${date.slice(0, 7)}`, "_blank")}
          >
            <FileText /> Monthly sheet
          </Button>
          {canEdit ? (
            <Button variant="secondary" size="sm" loading={all.pending} onClick={() => all.execute({ date })}>
              <CalendarCheck /> Mark rest present
            </Button>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No active staff" description="Add team members on the Team tab." />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.staffId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Avatar name={r.name} size="sm" />
              <Link
                href={`/app/staff/${r.staffId}/attendance?month=${date.slice(0, 7)}`}
                className="group min-w-[160px] flex-1"
                title={`${r.name}'s attendance — month view, date range and PDF`}
              >
                <p className="text-[13px] font-medium text-ink group-hover:text-brand-600">
                  {r.name} <ChevronRight className="inline size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="text-xs text-muted">{r.roleTitle} · <span className="whitespace-nowrap group-hover:text-brand-600">View attendance</span></p>
              </Link>
              <div className="flex flex-wrap gap-1">
                {STATUSES.map((s) => (
                  <button suppressHydrationWarning
                    key={s}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => mark.execute({ staffId: r.staffId, date, status: s, clockIn: r.clockIn, clockOut: r.clockOut, notes: null })}
                    className={cn(
                      "h-7 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                      r.status === s ? ACTIVE[s] : "border-line text-ink-2 hover:border-line-strong hover:bg-canvas",
                    )}
                  >
                    {ATTENDANCE_STATUS[s]!.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <TimeInput
                  label="In"
                  value={r.clockIn}
                  disabled={!canEdit || !r.status || r.status === "ABSENT" || r.status === "LEAVE"}
                  onSave={(v) => mark.execute({ staffId: r.staffId, date, status: (r.status ?? "PRESENT") as never, clockIn: v, clockOut: r.clockOut, notes: null })}
                />
                <TimeInput
                  label="Out"
                  value={r.clockOut}
                  disabled={!canEdit || !r.status || r.status === "ABSENT" || r.status === "LEAVE"}
                  onSave={(v) => mark.execute({ staffId: r.staffId, date, status: (r.status ?? "PRESENT") as never, clockIn: r.clockIn, clockOut: v, notes: null })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TimeInput({ label, value, disabled, onSave }: { label: string; value: string | null; disabled: boolean; onSave: (v: string | null) => void }) {
  const [v, setV] = React.useState(value ?? "");
  React.useEffect(() => setV(value ?? ""), [value]);
  return (
    <label className="flex items-center gap-1 text-2xs text-muted">
      {label}
      <Input type="time" inputSize="sm" className="w-[104px]" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v || null)} />
    </label>
  );
}

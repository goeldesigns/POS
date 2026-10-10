import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendancePeriodBar } from "@/components/staff/attendance-period";
import { Page } from "@/components/shell/page";
import { Avatar, Card, CardHeader, StatusBadge } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { MiniStat } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/format";
import { ATTENDANCE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { attendancePeriod, staffAttendanceReport, type DayState } from "@/server/services/attendance-reports";
import { zonedParts } from "@/server/time";

export const metadata: Metadata = { title: "Attendance" };

const SOFT: Record<string, string> = {
  PRESENT: "bg-success-50 text-success-700",
  LATE: "bg-warning-50 text-warning-700",
  HALF_DAY: "bg-info-50 text-info-700",
  LEAVE: "bg-sunken text-ink-2",
  ABSENT: "bg-danger-50 text-danger-700",
};

const STATE_LABEL: Record<Exclude<DayState, "marked">, string> = {
  unmarked: "Not marked",
  upcoming: "",
  "before-joining": "Not joined",
};

/** "8h 32m" */
function hours(h: number | null) {
  if (h == null) return "—";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export default async function StaffAttendancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("staff.view");
  const { id } = await params;
  const tz = ctx.restaurant.timezone;
  const period = attendancePeriod(await searchParams, tz);
  const [report, team] = await Promise.all([
    staffAttendanceReport(ctx, id, period, tz).catch(() => null),
    ctx.db.staffMember.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!report) notFound();
  const { staff, days, totals } = report;
  const today = zonedParts(new Date(), tz).ymd;
  const canEdit = ctx.permissions.has("staff.edit");
  // Monday-first calendar: blank cells before the 1st.
  const lead = (new Date(`${period.from}T12:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/app/staff" }, { label: "Attendance", href: "/app/staff?tab=attendance" }, { label: staff.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={staff.name} size="lg" />
            <span>
              {staff.name}
              <span className="mt-1 block text-xs font-normal text-muted">
                {staff.roleTitle} · {staff.employeeCode} · joined {formatDate(`${staff.joiningDate}T12:00:00Z`, "UTC")}
              </span>
            </span>
          </span>
        }
      />

      <Card className="overflow-hidden">
        <AttendancePeriodBar
          mode={period.mode}
          month={period.month}
          from={period.from}
          to={period.to}
          today={today}
          query={period.query}
          staffId={staff.id}
          staff={team.some((t) => t.id === staff.id) ? team : [{ id: staff.id, name: staff.name }, ...team]}
        />
        <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-4 sm:divide-x xl:grid-cols-8">
          <MiniStat label="Present" value={totals.PRESENT} />
          <MiniStat label="Late" value={totals.LATE} />
          <MiniStat label="Half day" value={totals.HALF_DAY} />
          <MiniStat label="Leave" value={totals.LEAVE} />
          <MiniStat label="Absent" value={totals.ABSENT} />
          <MiniStat label="Not marked" value={totals.unmarked} />
          <MiniStat label="Hours worked" value={hours(totals.hours)} />
          <MiniStat label="Attendance" value={totals.rate == null ? "—" : `${totals.rate}%`} sub={`${totals.payableDays} payable days`} />
        </div>

        {period.mode === "month" ? (
          <div className="p-4">
            <p className="mb-2 text-[13px] font-semibold text-ink">{period.label}</p>
            <div className="grid grid-cols-7 gap-1.5 text-center text-2xs font-medium tracking-wide text-muted uppercase">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d} className="py-1">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: lead }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {days.map((d) => (
                <div
                  key={d.date}
                  title={d.status ? ATTENDANCE_STATUS[d.status]!.label : STATE_LABEL[d.state as Exclude<DayState, "marked">]}
                  className={cn(
                    "min-h-[64px] rounded-lg p-1.5 text-left sm:min-h-[72px] sm:p-2",
                    d.status ? SOFT[d.status] : d.state === "unmarked" ? "border border-dashed border-line-strong" : "bg-canvas/60 text-subtle",
                    d.date === today && "ring-2 ring-brand-300",
                  )}
                >
                  <p className="text-[12px] font-semibold">{Number(d.date.slice(8))}</p>
                  <p className="mt-0.5 hidden truncate text-[11px] font-medium sm:block">
                    {d.status ? ATTENDANCE_STATUS[d.status]!.label : STATE_LABEL[d.state as Exclude<DayState, "marked">]}
                  </p>
                  {d.clockIn ? (
                    <p className="hidden truncate text-[10.5px] opacity-80 sm:block">
                      {d.clockIn}
                      {d.clockOut ? `–${d.clockOut}` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", SOFT[k])} /> {v.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm border border-dashed border-line-strong" /> Not marked
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Day by day" description={period.label} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-canvas/70 text-left text-xs font-medium text-muted">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">In</th>
                <th className="px-4 py-2">Out</th>
                <th className="px-4 py-2 text-right">Hours</th>
                <th className="px-4 py-2">Shift</th>
                <th className="px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className={cn("border-b border-line last:border-b-0", d.state === "upcoming" || d.state === "before-joining" ? "text-subtle" : "text-ink")}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {canEdit && d.state !== "upcoming" ? (
                      <Link href={`/app/staff?tab=attendance&date=${d.date}`} className="font-medium hover:text-brand-600" title="Open this day in the register">
                        {formatDate(`${d.date}T12:00:00Z`, "UTC")}
                      </Link>
                    ) : (
                      <span className="font-medium">{formatDate(`${d.date}T12:00:00Z`, "UTC")}</span>
                    )}
                    <span className="ml-1.5 text-xs text-muted">{d.weekday}</span>
                  </td>
                  <td className="px-4 py-2">
                    {d.status ? (
                      <StatusBadge dict={ATTENDANCE_STATUS} value={d.status} size="sm" />
                    ) : d.state === "unmarked" ? (
                      <span className="text-xs text-warning-700">Not marked</span>
                    ) : (
                      <span className="text-xs">{STATE_LABEL[d.state as Exclude<DayState, "marked">] || "—"}</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-2">{d.clockIn ?? "—"}</td>
                  <td className="tabular px-4 py-2">{d.clockOut ?? "—"}</td>
                  <td className="tabular px-4 py-2 text-right">{hours(d.hours)}</td>
                  <td className="px-4 py-2 text-muted">{d.shift ?? "—"}</td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-muted">{d.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

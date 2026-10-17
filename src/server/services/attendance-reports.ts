import type { AttendanceStatus } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";
import { param, type SearchParams } from "../list-params";
import { zonedParts } from "../time";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
/** Longest date range one statement covers. */
const MAX_DAYS = 366;

export interface AttendancePeriod {
  mode: "month" | "range";
  from: string;
  to: string;
  month: string | null;
  label: string;
  /** Query string that reproduces this period (for links and the PDF). */
  query: string;
}

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const monthLabel = (m: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayList(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A month (?month=2026-10) or a date range (?from=…&to=…). Defaults to this month on the restaurant's clock. */
export function attendancePeriod(sp: SearchParams, tz: string): AttendancePeriod {
  const from = param(sp, "from");
  const to = param(sp, "to");
  if (from && to && ISO_DAY.test(from) && ISO_DAY.test(to)) {
    const [a, b0] = from <= to ? [from, to] : [to, from];
    const b = dayList(a, b0).at(-1)!;
    return { mode: "range", from: a, to: b, month: null, label: `${dayLabel(a)} – ${dayLabel(b)}`, query: `from=${a}&to=${b}` };
  }
  const m = param(sp, "month");
  const month = m && ISO_MONTH.test(m) ? m : zonedParts(new Date(), tz).ym;
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { mode: "month", from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, month, label: monthLabel(month), query: `month=${month}` };
}

export function clockTime(d: Date | null | undefined, tz: string) {
  return d ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(d) : null;
}

export type DayState = "marked" | "unmarked" | "upcoming" | "before-joining";

interface Totals {
  PRESENT: number;
  LATE: number;
  HALF_DAY: number;
  LEAVE: number;
  ABSENT: number;
  unmarked: number;
  hours: number;
  payableDays: number;
  rate: number | null;
}

interface TotalsWire {
  present: number;
  late: number;
  halfDay: number;
  leave: number;
  absent: number;
  unmarked: number;
  hours: number;
  payableDays: number;
  rate: number | null;
}

const toTotals = (t: TotalsWire): Totals => ({ PRESENT: t.present, LATE: t.late, HALF_DAY: t.halfDay, LEAVE: t.leave, ABSENT: t.absent, unmarked: t.unmarked, hours: t.hours, payableDays: t.payableDays, rate: t.rate });

const rangeQuery = (period: AttendancePeriod) => (period.mode === "month" ? { month: period.month } : { from: period.from, to: period.to });

export async function staffAttendanceReport(_ctx: ServiceContext, staffId: string, period: AttendancePeriod, _tz: string) {
  const report = await backend.get<{
    staff: { id: string; name: string; roleTitle: string; employeeCode: string; joiningDate: string; status: "ACTIVE" | "ON_LEAVE" | "INACTIVE"; phone: string };
    days: {
      date: string;
      weekday: string;
      status: AttendanceStatus | null;
      state: DayState;
      clockIn: string | null;
      clockOut: string | null;
      hours: number | null;
      shift: string | null;
      notes: string | null;
    }[];
    totals: TotalsWire;
  }>(`/api/v1/staff/${staffId}/attendance-report`, rangeQuery(period));
  return { staff: report.staff, period, days: report.days, totals: toTotals(report.totals) };
}

export type StaffAttendanceReport = Awaited<ReturnType<typeof staffAttendanceReport>>;

export async function teamAttendanceSheet(_ctx: ServiceContext, period: AttendancePeriod, _tz: string) {
  const sheet = await backend.get<{
    truncated: boolean;
    dates: { date: string; day: number; weekday: string }[];
    rows: {
      id: string;
      name: string;
      roleTitle: string;
      employeeCode: string;
      cells: { date: string; status: AttendanceStatus | null; state: DayState; hours: number | null }[];
      totals: TotalsWire;
    }[];
  }>("/api/v1/staff/attendance/sheet", rangeQuery(period));
  return { period, truncated: sheet.truncated, dates: sheet.dates, rows: sheet.rows.map((r) => ({ ...r, totals: toTotals(r.totals) })) };
}

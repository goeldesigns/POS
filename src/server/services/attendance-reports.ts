import type { AttendanceStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { NotFoundError } from "../errors";
import { param, type SearchParams } from "../list-params";
import { zonedParts } from "../time";
import { toDbDate } from "./staff";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
/** Longest date range one statement covers. */
const MAX_DAYS = 366;
/** The team sheet has one column per day, so it covers at most a month. */
const SHEET_DAYS = 31;

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

/** Hours between clock-in and clock-out; a shift past midnight wraps to the next day. */
function workedHours(clockIn: Date, clockOut: Date) {
  let ms = clockOut.getTime() - clockIn.getTime();
  if (ms < 0) ms += 24 * 3_600_000;
  return Math.round((ms / 3_600_000) * 100) / 100;
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
  /** Present + late + half of each half day — the figure payroll usually wants. */
  payableDays: number;
  /** Payable days over the days that counted (marked or overdue). */
  rate: number | null;
}

function summarize(days: { status: AttendanceStatus | null; state: DayState; hours: number | null }[]): Totals {
  const t: Totals = { PRESENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, ABSENT: 0, unmarked: 0, hours: 0, payableDays: 0, rate: null };
  for (const d of days) {
    if (d.status) t[d.status] += 1;
    if (d.state === "unmarked") t.unmarked += 1;
    t.hours += d.hours ?? 0;
  }
  t.hours = Math.round(t.hours * 10) / 10;
  t.payableDays = t.PRESENT + t.LATE + t.HALF_DAY / 2;
  const counted = days.filter((d) => d.state === "marked" || d.state === "unmarked").length;
  t.rate = counted ? Math.round((t.payableDays / counted) * 1000) / 10 : null;
  return t;
}

/** One person's attendance, day by day, with totals. */
export async function staffAttendanceReport(ctx: ServiceContext, staffId: string, period: AttendancePeriod, tz: string) {
  assertPermission(ctx, "staff.view");
  const staff = await ctx.db.staffMember.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, roleTitle: true, employeeCode: true, joiningDate: true, status: true, phone: true },
  });
  if (!staff) throw new NotFoundError("Staff member");
  const range = { gte: toDbDate(period.from), lte: toDbDate(period.to) };
  const [attendance, shifts] = await Promise.all([
    ctx.db.attendance.findMany({ where: { staffId, date: range } }),
    ctx.db.shift.findMany({ where: { staffId, date: range }, orderBy: { startTime: "asc" } }),
  ]);
  const today = zonedParts(new Date(), tz).ymd;
  const joined = staff.joiningDate.toISOString().slice(0, 10);
  const byDay = new Map(attendance.map((a) => [a.date.toISOString().slice(0, 10), a]));
  const shiftsByDay = new Map<string, string[]>();
  for (const s of shifts) {
    const k = s.date.toISOString().slice(0, 10);
    shiftsByDay.set(k, [...(shiftsByDay.get(k) ?? []), `${s.startTime}–${s.endTime}${s.station ? ` · ${s.station}` : ""}`]);
  }

  const days = dayList(period.from, period.to).map((date) => {
    const a = byDay.get(date);
    const state: DayState = a ? "marked" : date > today ? "upcoming" : date < joined ? "before-joining" : "unmarked";
    return {
      date,
      weekday: new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)),
      status: a?.status ?? null,
      state,
      clockIn: clockTime(a?.clockIn, tz),
      clockOut: clockTime(a?.clockOut, tz),
      hours: a?.clockIn && a?.clockOut ? workedHours(a.clockIn, a.clockOut) : null,
      shift: shiftsByDay.get(date)?.join(", ") ?? null,
      notes: a?.notes ?? null,
    };
  });

  return {
    staff: { ...staff, joiningDate: joined },
    period,
    days,
    totals: summarize(days),
  };
}

export type StaffAttendanceReport = Awaited<ReturnType<typeof staffAttendanceReport>>;

/** Everyone's attendance for up to a month: one row per person, one column per day. */
export async function teamAttendanceSheet(ctx: ServiceContext, period: AttendancePeriod, tz: string) {
  assertPermission(ctx, "staff.view");
  const dates = dayList(period.from, period.to).slice(0, SHEET_DAYS);
  const range = { gte: toDbDate(dates[0]!), lte: toDbDate(dates.at(-1)!) };
  const staff = await ctx.db.staffMember.findMany({
    // Active people, plus anyone who has records in the period (e.g. left since).
    where: { OR: [{ status: { not: "INACTIVE" } }, { attendance: { some: { date: range } } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, roleTitle: true, employeeCode: true, joiningDate: true, attendance: { where: { date: range } } },
  });
  const today = zonedParts(new Date(), tz).ymd;
  const rows = staff.map((s) => {
    const joined = s.joiningDate.toISOString().slice(0, 10);
    const byDay = new Map(s.attendance.map((a) => [a.date.toISOString().slice(0, 10), a]));
    const cells = dates.map((date) => {
      const a = byDay.get(date);
      const state: DayState = a ? "marked" : date > today ? "upcoming" : date < joined ? "before-joining" : "unmarked";
      return { date, status: a?.status ?? null, state, hours: a?.clockIn && a?.clockOut ? workedHours(a.clockIn, a.clockOut) : null };
    });
    return { id: s.id, name: s.name, roleTitle: s.roleTitle, employeeCode: s.employeeCode, cells, totals: summarize(cells) };
  });
  return {
    period,
    truncated: dayList(period.from, period.to).length > SHEET_DAYS,
    dates: dates.map((d) => ({ date: d, day: Number(d.slice(8)), weekday: new Intl.DateTimeFormat("en-IN", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) })),
    rows,
  };
}

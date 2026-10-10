import { TZDate } from "@date-fns/tz";
import type { Tone } from "./labels";

/**
 * Demo booking rules, shared by the public scheduler, the server (which
 * re-checks everything) and the Super Admin console.
 */
export const DEMO = {
  timezone: "Asia/Kolkata",
  timezoneLabel: "IST",
  daysAhead: 30,
  slotMinutes: 30,
  firstSlot: "10:00",
  lastSlot: "18:30",
  /** 0 = Sunday. */
  closedWeekdays: [0] as readonly number[],
  /** Parallel demos our team can run in one slot. */
  capacityPerSlot: 2,
  /** Earliest bookable slot is this far from now. */
  leadMinutes: 120,
  durationMinutes: 30,
} as const;

export const DEMO_STATUSES = ["NEW", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export type DemoStatusValue = (typeof DEMO_STATUSES)[number];

export const DEMO_STATUS: Record<DemoStatusValue, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "danger" },
};

/** Statuses that hold a slot. */
export const DEMO_OPEN_STATUSES: readonly DemoStatusValue[] = ["NEW", "CONFIRMED"];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};
const toHhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** All slot start times in a bookable day, e.g. ["10:00", "10:30", …]. */
export function demoSlotTimes(): string[] {
  const out: string[] = [];
  for (let m = toMinutes(DEMO.firstSlot); m <= toMinutes(DEMO.lastSlot); m += DEMO.slotMinutes) out.push(toHhmm(m));
  return out;
}

export function isDemoSlotTime(time: string): boolean {
  return demoSlotTimes().includes(time);
}

/** "14:30" → "2:30 PM" */
export function formatSlot(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h! >= 12 ? "PM" : "AM";
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Wall-clock date + time in the demo timezone → UTC instant. */
export function demoInstant(date: string, time: string): Date {
  return new Date(new TZDate(`${date}T${time}:00`, DEMO.timezone).getTime());
}

/** UTC instant → { date: "YYYY-MM-DD", time: "HH:MM" } in the demo timezone. */
export function demoParts(instant: Date | string): { date: string; time: string } {
  const d = new Date(instant);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DEMO.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** "2026-10-16" → "Fri, 16 Oct" */
export function formatDemoDate(date: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(opts.year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export interface DemoDay {
  date: string;
  /** Bookable slots and how many places are left in each. */
  slots: { time: string; remaining: number }[];
}

import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInCalendarDays, startOfDay, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";

/**
 * Restaurant-timezone aware ranges. Comparisons use the *same elapsed window*
 * of the previous period (e.g. today until 2:15 PM vs yesterday until 2:15 PM)
 * so mid-day numbers aren't compared against a full day.
 */
export type PeriodPreset = "today" | "yesterday" | "week" | "month" | "7d" | "30d" | "90d" | "12m" | "custom";

export interface PeriodRange {
  preset: PeriodPreset;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  label: string;
  compareLabel: string;
  bucket: "hour" | "day" | "month";
  days: number;
}

export function resolvePeriod(
  preset: PeriodPreset,
  tz: string,
  opts: { now?: Date; from?: string | null; to?: string | null } = {},
): PeriodRange {
  const now = new TZDate(opts.now ?? new Date(), tz);
  const today = startOfDay(now);

  const make = (start: Date, end: Date, prevStart: Date, prevEnd: Date, label: string, compareLabel: string): PeriodRange => {
    const days = Math.max(1, differenceInCalendarDays(new TZDate(end.getTime(), tz), new TZDate(start.getTime(), tz)) + (end.getTime() > startOfDay(new TZDate(end.getTime(), tz)).getTime() ? 1 : 0));
    return {
      preset,
      start: new Date(start.getTime()),
      end: new Date(end.getTime()),
      prevStart: new Date(prevStart.getTime()),
      prevEnd: new Date(prevEnd.getTime()),
      label,
      compareLabel,
      bucket: days <= 1 ? "hour" : days > 92 ? "month" : "day",
      days,
    };
  };

  switch (preset) {
    case "yesterday": {
      const s = subDays(today, 1);
      return make(s, today, subDays(s, 1), s, "Yesterday", "vs day before");
    }
    case "week": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const elapsed = now.getTime() - s.getTime();
      const ps = subDays(s, 7);
      return make(s, now, ps, new TZDate(ps.getTime() + elapsed, tz), "This week", "vs last week");
    }
    case "month": {
      const s = startOfMonth(now);
      const ps = subMonths(s, 1);
      const elapsed = now.getTime() - s.getTime();
      return make(s, now, ps, new TZDate(Math.min(ps.getTime() + elapsed, s.getTime()), tz), "This month", "vs last month");
    }
    case "7d":
    case "30d":
    case "90d": {
      const n = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
      const s = subDays(addDays(today, 1), n);
      return make(s, now, subDays(s, n), s, `Last ${n} days`, `vs previous ${n} days`);
    }
    case "12m": {
      const s = startOfMonth(subMonths(now, 11));
      return make(s, now, subMonths(s, 12), s, "Last 12 months", "vs previous 12 months");
    }
    case "custom": {
      const from = opts.from ? startOfDay(new TZDate(`${opts.from}T00:00:00`, tz)) : subDays(today, 29);
      const toDay = opts.to ? startOfDay(new TZDate(`${opts.to}T00:00:00`, tz)) : today;
      const end = addDays(toDay, 1);
      const span = Math.max(1, differenceInCalendarDays(end, from));
      return make(from, end.getTime() > now.getTime() ? now : end, subDays(from, span), from, `${opts.from ?? ""} – ${opts.to ?? ""}`, "vs previous period");
    }
    case "today":
    default: {
      const elapsed = now.getTime() - today.getTime();
      const ys = subDays(today, 1);
      return make(today, now, ys, new TZDate(ys.getTime() + elapsed, tz), "Today", "vs yesterday, same time");
    }
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of an instant in a timezone. */
export function zonedParts(date: Date, tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    partsCache.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    ym: `${p.year}-${p.month}`,
    hour: Number(p.hour) % 24,
    weekday: p.weekday!,
  };
}

/** Ordered bucket keys covering a range (for zero-filled charts). */
export function bucketKeys(range: Pick<PeriodRange, "start" | "end" | "bucket">, tz: string): string[] {
  if (range.bucket === "hour") return Array.from({ length: 24 }, (_, h) => String(h));
  const keys: string[] = [];
  let cursor = new TZDate(range.start.getTime(), tz);
  const guard = 400;
  for (let i = 0; i < guard && cursor.getTime() < range.end.getTime(); i++) {
    const p = zonedParts(cursor, tz);
    const key = range.bucket === "month" ? p.ym : p.ymd;
    if (keys[keys.length - 1] !== key) keys.push(key);
    cursor = range.bucket === "month" ? addMonths(startOfMonth(cursor), 1) : addDays(startOfDay(cursor), 1);
  }
  return keys;
}

export function bucketOf(date: Date, bucket: PeriodRange["bucket"], tz: string): string {
  const p = zonedParts(date, tz);
  return bucket === "hour" ? String(p.hour) : bucket === "month" ? p.ym : p.ymd;
}

export function bucketLabel(key: string, bucket: PeriodRange["bucket"]): string {
  if (bucket === "hour") {
    const h = Number(key);
    return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
  }
  if (bucket === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "3 months" },
  { value: "12m", label: "12 months" },
];

export function parsePreset(value: string | undefined, allowed: PeriodPreset[], fallback: PeriodPreset): PeriodPreset {
  return value && (allowed as string[]).includes(value) ? (value as PeriodPreset) : fallback;
}

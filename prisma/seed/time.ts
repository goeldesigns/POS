/** IST helpers for seed data (fixed +05:30, no DST). */
export const IST_OFFSET_MIN = 330;
const DAY = 86_400_000;

/** UTC instant of local midnight `daysAgo` days before today (IST). */
export function istMidnight(daysAgo: number, now = new Date()): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightLocalAsUtc - IST_OFFSET_MIN * 60_000 - daysAgo * DAY);
}

/** UTC instant for a local IST wall-clock time on a given day offset. */
export function istAt(daysAgo: number, hour: number, minute = 0, now = new Date()): Date {
  return new Date(istMidnight(daysAgo, now).getTime() + (hour * 60 + minute) * 60_000);
}

/** Current IST hour + fractional minutes. */
export function istNowHours(now = new Date()): number {
  const local = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

/** Day of week (0 Sunday) for a day offset in IST. */
export function istWeekday(daysAgo: number, now = new Date()): number {
  const d = new Date(istMidnight(daysAgo, now).getTime() + IST_OFFSET_MIN * 60_000);
  return d.getUTCDay();
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function daysAgo(n: number, now = new Date()): Date {
  return new Date(now.getTime() - n * DAY);
}

/** Calendar date stored at 12:00 UTC (matches the app's date-only convention). */
export function dateOnly(daysAgoN: number, now = new Date()): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MIN * 60_000 - daysAgoN * DAY);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12));
}

/**
 * Display formatting. Money values are integers in minor units (paise).
 * Locale defaults to en-IN so INR renders with Indian digit grouping (₹1,24,850).
 */

const DEFAULT_CURRENCY = "INR";
const DEFAULT_LOCALE = "en-IN";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, decimals: number, locale: string) {
  const key = `${locale}|${currency}|${decimals}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

export interface MoneyOptions {
  currency?: string;
  locale?: string;
  /** "auto" hides paise for whole amounts (₹499 vs ₹499.50). */
  decimals?: 0 | 2 | "auto";
}

export function formatMoney(minor: number, opts: MoneyOptions = {}): string {
  const { currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE, decimals = "auto" } = opts;
  const d = decimals === "auto" ? (Math.round(minor) % 100 === 0 ? 0 : 2) : decimals;
  return moneyFormatter(currency, d, locale).format(minor / 100);
}

/** ₹1.2L / ₹3.4Cr style compact money for charts and dense tiles. */
export function formatMoneyCompact(minor: number, opts: Omit<MoneyOptions, "decimals"> = {}): string {
  const { currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE } = opts;
  const major = minor / 100;
  if (Math.abs(major) < 10_000) return formatMoney(minor, { currency, locale, decimals: 0 });
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(major);
}

export function toMinor(major: number | string): number {
  const n = typeof major === "string" ? Number.parseFloat(major) : major;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function currencySymbol(currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE): string {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

const numberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE);

export function formatNumber(value: number, maxDecimals = 0): string {
  if (maxDecimals === 0) return numberFormatter.format(Math.round(value));
  return new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits: maxDecimals }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─── Dates ──────────────────────────────────────────────────────────────────

type DateInput = Date | string | number;

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d);
}

export function formatDate(d: DateInput, timeZone?: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone }).format(
    toDate(d),
  );
}

export function formatShortDate(d: DateInput, timeZone?: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { day: "2-digit", month: "short", timeZone }).format(toDate(d));
}

export function formatTime(d: DateInput, timeZone?: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .format(toDate(d))
    .toUpperCase();
}

export function formatDateTime(d: DateInput, timeZone?: string): string {
  return `${formatDate(d, timeZone)}, ${formatTime(d, timeZone)}`;
}

export function formatRelative(d: DateInput, now: Date = new Date()): string {
  const diffMs = toDate(d).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), "day");
  return formatDate(d);
}

/** "1h 12m" style elapsed time used on table cards and kitchen tickets. */
export function formatElapsed(from: DateInput, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - toDate(from).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatQuantity(value: number, unit?: string): string {
  const rounded = Math.round(value * 1000) / 1000;
  const text = formatNumber(rounded, 3);
  return unit ? `${text} ${unit.toLowerCase()}` : text;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
}

/** Today's date as "yyyy-MM-dd" on the given timezone's wall clock (for date inputs). */
export function todayISO(timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

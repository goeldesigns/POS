import { z } from "zod";

/**
 * Field helpers. Form inputs arrive as strings; these helpers accept either a
 * string (from a form) or a number (from programmatic calls) and normalise.
 * Money helpers take *major* units (₹499.50) and output *minor* units (49950).
 */

export const requiredString = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalString = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const emailField = (label = "Email") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .toLowerCase()
    .min(1, `${label} is required`)
    .pipe(z.email("Enter a valid email address"));

export const optionalEmail = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address");

export const phoneField = (label = "Phone") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\+?[\d\s-]{7,18}$/, "Enter a valid phone number");

export const optionalPhone = () =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\+?[\d\s-]{7,18}$/.test(v), "Enter a valid phone number");

export const passwordField = () =>
  z
    .string({ error: "Password is required" })
    .min(8, "Use at least 8 characters")
    .max(128, "Use at most 128 characters")
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/\d/, "Include at least one number");

type NumOpts = { min?: number; max?: number; int?: boolean };

function parseNumeric(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,₹\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function numberCheck(label: string, n: number, opts: NumOpts, ctx: z.RefinementCtx): boolean {
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: `${label} must be a number` });
    return false;
  }
  if (opts.int && !Number.isInteger(n)) {
    ctx.addIssue({ code: "custom", message: `${label} must be a whole number` });
    return false;
  }
  if (opts.min !== undefined && n < opts.min) {
    ctx.addIssue({ code: "custom", message: `${label} must be at least ${opts.min}` });
    return false;
  }
  if (opts.max !== undefined && n > opts.max) {
    ctx.addIssue({ code: "custom", message: `${label} must be at most ${opts.max}` });
    return false;
  }
  return true;
}

const numericInput = z.union([z.string(), z.number()]);

export const numberField = (label: string, opts: NumOpts = {}) =>
  numericInput.transform((v, ctx) => {
    const n = parseNumeric(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: `${label} is required` });
      return z.NEVER;
    }
    return numberCheck(label, n, opts, ctx) ? n : z.NEVER;
  });

export const optionalNumberField = (label: string, opts: NumOpts = {}) =>
  numericInput
    .optional()
    .nullable()
    .transform((v, ctx) => {
      const n = parseNumeric(v);
      if (n === null) return null;
      return numberCheck(label, n, opts, ctx) ? n : z.NEVER;
    });

/** Major-unit input → integer minor units. */
export const moneyField = (label: string, opts: { min?: number; max?: number } = {}) =>
  numberField(label, { min: opts.min ?? 0, max: opts.max ?? 10_000_000 }).transform((n) => Math.round(n * 100));

export const optionalMoneyField = (label: string) =>
  optionalNumberField(label, { min: 0, max: 10_000_000 }).transform((n) => (n === null ? null : Math.round(n * 100)));

/** "2026-10-08" → Date at 12:00 UTC (keeps the calendar day stable in any timezone). */
export const dateOnlyField = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Enter a valid ${label.toLowerCase()}`)
    .transform((s) => new Date(`${s}T12:00:00.000Z`));

export const optionalDateOnly = () =>
  z
    .string()
    .optional()
    .nullable()
    .transform((s, ctx) => {
      if (!s) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date" });
        return z.NEVER;
      }
      return new Date(`${s}T12:00:00.000Z`);
    });

export const idField = (label = "Record") => z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(64);
export const optionalId = () =>
  z
    .string()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const boolField = () => z.boolean().default(false);

export function toDateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

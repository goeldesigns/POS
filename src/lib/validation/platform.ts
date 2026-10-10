import { z } from "zod";
import {
  emailField,
  idField,
  moneyField,
  numberField,
  optionalNumberField,
  optionalString,
  passwordField,
  phoneField,
  requiredString,
} from "./helpers";

export const RESTAURANT_TYPES = [
  "Casual Dining",
  "Fine Dining",
  "Quick Service (QSR)",
  "Cafe",
  "Cloud Kitchen",
  "Bar & Lounge",
  "Bakery & Desserts",
  "Food Court",
] as const;

export const CURRENCIES = ["INR", "USD", "AED", "GBP", "EUR", "SGD"] as const;

export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
    "GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5",
  );

const fssai = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{14}$/.test(v), "FSSAI licence number has 14 digits");

export const restaurantProfileFields = {
  name: requiredString("Restaurant name", 80),
  legalName: optionalString(120),
  ownerName: requiredString("Owner name", 80),
  email: emailField("Business email"),
  phone: phoneField(),
  addressLine: optionalString(200),
  city: optionalString(60),
  state: optionalString(60),
  country: requiredString("Country", 60),
  postalCode: optionalString(12),
  gstNumber: gstin,
  fssaiNumber: fssai,
  currency: z.enum(CURRENCIES),
  timezone: z.enum(TIMEZONES),
  restaurantType: z.enum(RESTAURANT_TYPES),
};

export const restaurantProfileSchema = z.object(restaurantProfileFields);

export const createRestaurantSchema = z
  .object({
    ...restaurantProfileFields,
    numberOfTables: numberField("Number of tables", { min: 0, max: 500, int: true }),
    taxRate: numberField("Tax rate", { min: 0, max: 40 }),
    taxInclusive: z.boolean(),
    serviceChargePercent: numberField("Service charge", { min: 0, max: 25 }),
    defaultOrderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "ONLINE"]),
    receiptHeader: optionalString(200),
    receiptFooter: optionalString(200),
    planKey: requiredString("Plan", 40),
    modules: z.array(z.string()).default([]),
    loginEmail: emailField("Login email"),
    password: passwordField(),
    confirmPassword: z.string().min(1, "Confirm the password"),
    /** Set when the restaurant is created from a demo request. */
    demoRequestId: z.string().max(64).optional().nullable(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const updateRestaurantSchema = z.object({ id: idField(), ...restaurantProfileFields });

export const suspendRestaurantSchema = z.object({
  id: idField(),
  reason: requiredString("Reason", 300),
});

export const restaurantIdSchema = z.object({ id: idField() });

export const archiveRestaurantSchema = z.object({
  id: idField(),
  confirmName: z.string().min(1, "Type the restaurant name to confirm"),
});

export const restaurantModulesSchema = z.object({
  restaurantId: idField(),
  modules: z.array(z.string()),
});

export const changeSubscriptionSchema = z.object({
  restaurantId: idField(),
  planKey: requiredString("Plan"),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]),
  billingInterval: z.enum(["MONTHLY", "YEARLY"]),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a period end date"),
  applyPlanModules: z.boolean().default(false),
});

export const planSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,30}$/, "Use 2–30 lowercase letters, numbers or dashes"),
  name: requiredString("Plan name", 40),
  description: optionalString(240),
  priceMonthly: moneyField("Monthly price"),
  priceYearly: moneyField("Yearly price"),
  trialDays: numberField("Trial days", { min: 0, max: 90, int: true }),
  maxUsers: optionalNumberField("Max users", { min: 1, int: true }),
  maxTables: optionalNumberField("Max tables", { min: 1, int: true }),
  maxProducts: optionalNumberField("Max products", { min: 1, int: true }),
  maxLocations: optionalNumberField("Max locations", { min: 1, int: true }),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  features: z.array(z.string()),
});

export const platformSettingsSchema = z.object({
  platformName: requiredString("Platform name", 60),
  supportEmail: emailField("Support email"),
  supportPhone: optionalString(30),
  defaultPlanKey: requiredString("Default plan"),
  allowSelfSignup: z.boolean(),
  maintenanceBanner: optionalString(200),
});

export const createPlatformUserSchema = z.object({
  restaurantId: idField("Restaurant"),
  name: requiredString("Full name", 80),
  email: emailField(),
  phone: optionalString(20),
  password: passwordField(),
  roleId: idField("Role"),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  permissions: z.array(z.string()).optional(),
});

// ─── Super Admin acting inside a restaurant ─────────────────────────────────

export const adminMemberRefSchema = z.object({ restaurantId: idField(), memberId: idField() });

export const adminUpdateMemberSchema = adminMemberRefSchema.extend({
  roleId: idField("Role"),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const adminMemberPermissionsSchema = adminMemberRefSchema.extend({
  permissions: z.array(z.string()),
});

export const adminResetPasswordSchema = adminMemberRefSchema.extend({
  password: passwordField(),
});

export const userStatusSchema = z.object({
  userId: idField(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export const planIdSchema = z.object({ id: idField() });

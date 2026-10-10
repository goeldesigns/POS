import { z } from "zod";
import { emailField, numberField, optionalString, phoneField, requiredString } from "./helpers";
import { CURRENCIES, RESTAURANT_TYPES, TIMEZONES } from "./platform";

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5");

/** One schema per settings section. Keys double as the section slug. */
export const SETTINGS_SCHEMAS = {
  profile: z.object({
    name: requiredString("Restaurant name", 80),
    restaurantType: z.enum(RESTAURANT_TYPES),
    email: emailField("Business email"),
    phone: phoneField(),
    addressLine: optionalString(200),
    city: optionalString(60),
    state: optionalString(60),
    postalCode: optionalString(12),
    country: requiredString("Country", 60),
    logoUrl: optionalString(300),
  }),
  business: z.object({
    legalName: optionalString(120),
    gstNumber: gstin,
    fssaiNumber: z.string().trim().optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || /^\d{14}$/.test(v), "FSSAI licence number has 14 digits"),
    currency: z.enum(CURRENCIES),
    timezone: z.enum(TIMEZONES),
  }),
  tax: z.object({
    taxInclusive: z.boolean(),
    serviceChargePercent: numberField("Service charge", { min: 0, max: 25 }),
    roundOffTotals: z.boolean(),
  }),
  receipt: z.object({
    receiptHeader: optionalString(200),
    receiptFooter: optionalString(200),
    receiptShowGstin: z.boolean(),
    receiptShowFssai: z.boolean(),
    receiptPaperWidth: z.enum(["58", "80"]).transform(Number),
  }),
  invoice: z.object({
    invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,8}$/, "Use up to 8 letters, numbers or dashes"),
    orderPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,8}$/, "Use up to 8 letters, numbers or dashes"),
  }),
  payment: z.object({
    acceptCash: z.boolean(),
    acceptCard: z.boolean(),
    acceptUpi: z.boolean(),
    upiId: z.string().trim().optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || /^[\w.-]{2,}@[\w]{2,}$/.test(v), "Enter a UPI ID like spiceandstone@okaxis"),
  }),
  orders: z.object({
    defaultOrderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "ONLINE"]),
    requireCustomerForDelivery: z.boolean(),
    allowNegativeStock: z.boolean(),
  }),
  pos: z.object({
    autoPrintKot: z.boolean(),
    autoPrintReceipt: z.boolean(),
    requireManagerForVoid: z.boolean(),
  }),
  printers: z.object({
    receiptPrinterName: optionalString(80),
    kitchenPrinterName: optionalString(80),
  }),
  kitchen: z.object({
    autoCompleteOnPayment: z.boolean(),
    kitchenStations: z.array(z.string().trim().min(1).max(40)).max(12),
  }),
  tables: z.object({
    freeTableAfterPayment: z.boolean(),
  }),
  reservations: z.object({
    reservationSlotMinutes: numberField("Slot length", { min: 15, max: 120, int: true }),
    reservationDurationMinutes: numberField("Default duration", { min: 30, max: 480, int: true }),
    reservationLeadMinutes: numberField("Minimum notice", { min: 0, max: 1440, int: true }),
  }),
  notifications: z.object({
    notifyLowStock: z.boolean(),
    notifyNewOnlineOrder: z.boolean(),
    notifyReservations: z.boolean(),
    dailySummaryEmail: z.string().trim().toLowerCase().optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  }),
  security: z.object({
    sessionTimeoutMinutes: numberField("Session timeout", { min: 15, max: 10080, int: true }),
  }),
} as const;

export type SettingsSection = keyof typeof SETTINGS_SCHEMAS;

export function isSettingsSection(s: string): s is SettingsSection {
  return s in SETTINGS_SCHEMAS;
}

/** Sections stored on Restaurant rather than RestaurantSettings. */
export const RESTAURANT_FIELD_SECTIONS: SettingsSection[] = ["profile", "business"];

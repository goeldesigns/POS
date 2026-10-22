import { z } from "zod";
import {
  dateOnlyField,
  idField,
  moneyField,
  numberField,
  optionalDateOnly,
  optionalEmail,
  optionalId,
  optionalMoneyField,
  optionalNumberField,
  optionalString,
  optionalPhone,
  phoneField,
  requiredString,
} from "./helpers";

// ─── Orders (programmatic: POS, API, integrations) ──────────────────────────

export const ORDER_TYPES = ["DINE_IN", "TAKEAWAY", "DELIVERY", "ONLINE"] as const;
export const ORDER_SOURCES = ["POS", "WEBSITE", "SWIGGY", "ZOMATO", "ADMIN", "OTHER"] as const;
export const PAYMENT_METHODS = ["CASH", "CARD", "UPI", "WALLET", "OTHER"] as const;

export const orderLineSchema = z.object({
  productId: idField("Product"),
  variantId: optionalId(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(500),
  modifierIds: z.array(z.string().max(64)).max(20).default([]),
  notes: optionalString(200),
});

export const orderDraftSchema = z.object({
  orderId: optionalId(),
  source: z.enum(ORDER_SOURCES).default("POS"),
  type: z.enum(ORDER_TYPES),
  tableId: optionalId(),
  customerId: optionalId(),
  customer: z
    .object({
      name: requiredString("Customer name", 80),
      phone: optionalPhone(),
      email: optionalEmail(),
    })
    .nullable()
    .optional(),
  guests: z.number().int().min(1).max(100).nullable().optional(),
  notes: optionalString(300),
  deliveryAddress: optionalString(300),
  items: z.array(orderLineSchema).min(1, "Add at least one item").max(200),
  discount: z
    .object({
      type: z.enum(["PERCENT", "FLAT"]),
      /** Percent (0–100) or flat amount in minor units. */
      value: z.number().min(0),
      reason: optionalString(120),
    })
    .nullable()
    .optional(),
  couponCode: optionalString(30),
  redeemPoints: z.number().int().min(0).nullable().optional(),
  externalRef: optionalString(80),
});

export const paymentLineSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  /** Amount applied to the bill (minor units). */
  amount: z.number().int().min(1, "Amount must be greater than zero"),
  /** Cash tendered (minor units) — change is computed server side. */
  receivedAmount: z.number().int().min(0).nullable().optional(),
  reference: optionalString(80),
});

export const checkoutSchema = orderDraftSchema.extend({
  payments: z.array(paymentLineSchema).min(1, "Add a payment").max(6),
});

export const recordPaymentSchema = z.object({
  orderId: idField("Order"),
  payments: z.array(paymentLineSchema).min(1).max(6),
});

export const orderStatusSchema = z.object({
  orderId: idField("Order"),
  status: z.enum(["NEW", "PREPARING", "READY", "SERVED", "COMPLETED"]),
});

export const cancelOrderSchema = z.object({
  orderId: idField("Order"),
  reason: requiredString("Reason", 200),
});

export const refundOrderSchema = z.object({
  orderId: idField("Order"),
  amount: moneyField("Refund amount", { min: 0.01 }),
  method: z.enum(PAYMENT_METHODS),
  reason: requiredString("Reason", 200),
});

export const orderIdSchema = z.object({ orderId: idField("Order") });

export const sendReceiptSchema = z.object({
  orderId: idField("Order"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "BLOCKED"] as const;

export const floorSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Section name", 40),
});

export const tableSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Table name", 20),
  floorId: idField("Section"),
  capacity: numberField("Capacity", { min: 1, max: 40, int: true }),
  shape: z.enum(["SQUARE", "ROUND", "RECTANGLE"]),
  notes: optionalString(160),
});

export const tableStatusSchema = z.object({
  tableId: idField("Table"),
  status: z.enum(TABLE_STATUSES),
});

export const transferOrderSchema = z.object({
  orderId: idField("Order"),
  tableId: idField("Table"),
});

export const mergeTablesSchema = z.object({
  primaryTableId: idField("Primary table"),
  tableIds: z.array(z.string()).min(1, "Select at least one table to merge"),
});

export const tableIdSchema = z.object({ tableId: idField("Table") });

// ─── Reservations ───────────────────────────────────────────────────────────

export const RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

export const reservationSchema = z.object({
  id: z.string().optional(),
  customerId: optionalId(),
  customerName: requiredString("Guest name", 80),
  customerPhone: phoneField(),
  customerEmail: optionalEmail(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time"),
  partySize: numberField("Guests", { min: 1, max: 100, int: true }),
  durationMinutes: numberField("Duration", { min: 15, max: 480, int: true }),
  tableId: optionalId(),
  status: z.enum(RESERVATION_STATUSES),
  source: requiredString("Source", 30),
  notes: optionalString(300),
  saveCustomer: z.boolean().default(false),
});

export const reservationStatusSchema = z.object({
  id: idField("Reservation"),
  status: z.enum(RESERVATION_STATUSES),
});

export const assignReservationTableSchema = z.object({
  id: idField("Reservation"),
  tableId: optionalId(),
});

// ─── Customers ──────────────────────────────────────────────────────────────

export const customerSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Name", 80),
  phone: optionalPhone(),
  email: optionalEmail(),
  birthday: optionalDateOnly(),
  anniversary: optionalDateOnly(),
  tags: z.string().optional().default(""),
  addressLine1: optionalString(200),
  addressCity: optionalString(60),
  addressPostalCode: optionalString(12),
});

export const customerNoteSchema = z.object({
  customerId: idField("Customer"),
  body: requiredString("Note", 1000),
});

export const customerImportSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string(),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        birthday: z.string().optional().nullable(),
        tags: z.string().optional().nullable(),
      }),
    )
    .min(1, "The file has no rows")
    .max(5000, "Import up to 5,000 customers at a time"),
});

// ─── Coupons ────────────────────────────────────────────────────────────────

export const couponSchema = z
  .object({
    id: z.string().optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,20}$/, "Use 3–20 letters or numbers"),
    description: optionalString(160),
    type: z.enum(["PERCENT", "FLAT"]),
    value: numberField("Value", { min: 0.01, max: 100000 }),
    minOrder: optionalMoneyField("Minimum order"),
    maxDiscount: optionalMoneyField("Maximum discount"),
    validFrom: optionalDateOnly(),
    validTo: optionalDateOnly(),
    usageLimit: optionalNumberField("Usage limit", { min: 1, int: true }),
    isActive: z.boolean(),
  })
  .refine((v) => v.type !== "PERCENT" || v.value <= 100, { path: ["value"], message: "Percent must be ≤ 100" });

// ─── Expenses ───────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "RENT",
  "SALARY",
  "UTILITIES",
  "RAW_MATERIALS",
  "MAINTENANCE",
  "MARKETING",
  "TRANSPORT",
  "OTHER",
] as const;

export const expenseSchema = z.object({
  id: z.string().optional(),
  title: requiredString("Title", 120),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: moneyField("Amount", { min: 0.01 }),
  date: dateOnlyField("Date"),
  paymentMethod: z.enum(PAYMENT_METHODS),
  vendor: optionalString(80),
  notes: optionalString(500),
  attachmentUrl: optionalString(300),
  attachmentName: optionalString(160),
});

export const idSchema = z.object({ id: idField() });
export const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) });

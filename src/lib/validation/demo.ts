import { z } from "zod";
import { DEMO_STATUSES } from "../demo";
import { emailField, idField, numberField, optionalString, phoneField, requiredString } from "./helpers";
import { RESTAURANT_TYPES } from "./platform";

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");

const contactFields = {
  name: requiredString("Your name", 80),
  email: emailField("Work email"),
  phone: phoneField(),
  restaurantName: requiredString("Restaurant name", 80),
  city: optionalString(60),
  outlets: numberField("Outlets", { min: 1, max: 500, int: true }),
  restaurantType: z
    .enum(RESTAURANT_TYPES)
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  currentSystem: optionalString(80),
};

/** Public "Book a demo" form. `website` is a honeypot real visitors never see. */
export const demoRequestSchema = z.object({
  date: dateField,
  time: timeField,
  ...contactFields,
  message: optionalString(500),
  website: z.string().max(200).optional(),
});

export const demoAvailabilitySchema = z.object({});

/** Super Admin edit — every field, plus scheduling and follow-up. */
export const updateDemoSchema = z.object({
  id: idField(),
  date: dateField,
  time: timeField,
  durationMinutes: numberField("Duration", { min: 15, max: 180, int: true }),
  status: z.enum(DEMO_STATUSES),
  ...contactFields,
  message: optionalString(1000),
  meetingLink: optionalString(300).refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Enter a full link starting with https://"),
  adminNotes: optionalString(4000),
  assignedToId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  notifyCustomer: z.boolean().default(false),
});

export const demoStatusSchema = z.object({ id: idField(), status: z.enum(DEMO_STATUSES) });
export const demoIdSchema = z.object({ id: idField() });

import { z } from "zod";
import {
  dateOnlyField,
  emailField,
  idField,
  moneyField,
  optionalEmail,
  optionalId,
  optionalString,
  passwordField,
  phoneField,
  requiredString,
} from "./helpers";

export const createMemberSchema = z.object({
  name: requiredString("Full name", 80),
  email: emailField(),
  phone: optionalString(20),
  password: passwordField(),
  roleId: idField("Role"),
  status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
});

export const updateMemberSchema = z.object({
  memberId: idField(),
  roleId: idField("Role"),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const memberPermissionsSchema = z.object({
  memberId: idField(),
  permissions: z.array(z.string()),
});

export const resetMemberPasswordSchema = z.object({
  memberId: idField(),
  password: passwordField(),
});

export const roleSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Role name", 40),
  description: optionalString(160),
  permissions: z.array(z.string()),
});

export const STAFF_ROLE_TITLES = [
  "Owner",
  "Manager",
  "Cashier",
  "Waiter",
  "Head Chef",
  "Chef",
  "Kitchen Helper",
  "Bartender",
  "Accountant",
  "Inventory Manager",
  "Delivery Executive",
  "Housekeeping",
] as const;

export const staffSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Name", 80),
  email: optionalEmail(),
  phone: phoneField(),
  roleTitle: requiredString("Role", 40),
  employeeCode: requiredString("Employee ID", 20),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]),
  joiningDate: dateOnlyField("Joining date"),
  salary: moneyField("Monthly salary"),
  address: optionalString(240),
  emergencyContact: optionalString(80),
});

export const attendanceSchema = z.object({
  staffId: idField("Staff member"),
  date: dateOnlyField("Date"),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"]),
  clockIn: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
    .optional()
    .nullable()
    .or(z.literal("")),
  clockOut: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
    .optional()
    .nullable()
    .or(z.literal("")),
  notes: optionalString(200),
});

export const shiftSchema = z
  .object({
    id: z.string().optional(),
    staffId: idField("Staff member"),
    date: dateOnlyField("Date"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
    station: optionalString(40),
    notes: optionalString(200),
  })
  .refine((v) => v.startTime !== v.endTime, { path: ["endTime"], message: "End time must differ from start" });

export const staffLoginSchema = z.object({
  staffId: idField(),
  email: emailField("Login email"),
  password: passwordField(),
  roleId: idField("Role"),
});

export const linkStaffSchema = z.object({ staffId: idField(), memberId: optionalId() });

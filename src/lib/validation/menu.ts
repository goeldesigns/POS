import { z } from "zod";
import {
  idField,
  moneyField,
  numberField,
  optionalId,
  optionalMoneyField,
  optionalNumberField,
  optionalString,
  requiredString,
} from "./helpers";

export const FOOD_TYPES = ["VEG", "NON_VEG", "EGG", "VEGAN"] as const;

export const categorySchema = z.object({
  id: z.string().optional(),
  name: requiredString("Category name", 40),
  description: optionalString(160),
  color: optionalString(16),
  sortOrder: numberField("Sort order", { min: 0, max: 999, int: true }),
  isActive: z.boolean(),
});

const imageUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || /^https:\/\//.test(v) || v.startsWith("/api/v1/files/"),
    "Use an https:// image URL or upload an image",
  );

export const productSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Product name", 80),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "SKU is required")
    .max(24)
    .regex(/^[A-Z0-9-_]+$/, "Use letters, numbers, - or _"),
  categoryId: idField("Category"),
  description: optionalString(400),
  price: moneyField("Price"),
  costPrice: optionalMoneyField("Cost price"),
  imageUrl,
  taxRateId: optionalId(),
  foodType: z.enum(FOOD_TYPES),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  isBestseller: z.boolean(),
  isSpicy: z.boolean(),
  trackStock: z.boolean(),
  preparationTime: optionalNumberField("Preparation time", { min: 0, max: 240, int: true }),
  barcode: optionalString(40),
  kitchenStation: optionalString(40),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        name: requiredString("Variant name", 40),
        price: moneyField("Variant price"),
        isDefault: z.boolean(),
      }),
    )
    .default([]),
  modifierGroupIds: z.array(z.string()).default([]),
  isCombo: z.boolean().default(false),
  comboItems: z
    .array(
      z.object({
        productId: idField("Item"),
        quantity: numberField("Quantity", { min: 1, max: 20, int: true }),
      }),
    )
    .default([]),
});

export const modifierGroupSchema = z
  .object({
    id: z.string().optional(),
    name: requiredString("Group name", 40),
    minSelect: numberField("Minimum", { min: 0, max: 10, int: true }),
    maxSelect: numberField("Maximum", { min: 1, max: 20, int: true }),
    modifiers: z
      .array(
        z.object({
          id: z.string().optional(),
          name: requiredString("Option name", 40),
          price: moneyField("Option price"),
          isActive: z.boolean(),
        }),
      )
      .min(1, "Add at least one option"),
  })
  .refine((v) => v.maxSelect >= v.minSelect, { path: ["maxSelect"], message: "Maximum must be ≥ minimum" });

export const taxRateSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Tax name", 40),
  rate: numberField("Rate", { min: 0, max: 40 }),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

export const toggleProductSchema = z.object({
  id: idField(),
  field: z.enum(["isActive", "isAvailable", "isFeatured", "isBestseller"]),
  value: z.boolean(),
});

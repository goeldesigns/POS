import { z } from "zod";
import {
  idField,
  moneyField,
  numberField,
  optionalDateOnly,
  optionalEmail,
  optionalId,
  optionalNumberField,
  optionalString,
  requiredString,
} from "./helpers";

export const STOCK_UNIT_VALUES = ["KG", "G", "LTR", "ML", "PCS", "BOX", "PACK"] as const;

export const INGREDIENT_CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Dairy",
  "Meat & Poultry",
  "Seafood",
  "Grains & Flour",
  "Spices & Masala",
  "Oils & Sauces",
  "Bakery",
  "Beverages",
  "Packaging",
  "Cleaning",
  "Other",
] as const;

export const WASTE_REASONS = ["Expired", "Spoiled", "Spilled", "Overcooked", "Returned by guest", "Other"] as const;

export const ingredientSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Name", 80),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "SKU is required")
    .max(24)
    .regex(/^[A-Z0-9-_]+$/, "Use letters, numbers, - or _"),
  category: requiredString("Category", 40),
  unit: z.enum(STOCK_UNIT_VALUES),
  minStock: numberField("Minimum stock", { min: 0 }),
  maxStock: optionalNumberField("Maximum stock", { min: 0 }),
  costPerUnit: moneyField("Cost per unit"),
  supplierId: optionalId(),
  expiryDate: optionalDateOnly(),
  storageLocation: optionalString(40),
  openingStock: optionalNumberField("Opening stock", { min: 0 }),
  isActive: z.boolean().default(true),
});

export const supplierSchema = z.object({
  id: z.string().optional(),
  name: requiredString("Supplier name", 80),
  contactPerson: optionalString(80),
  phone: optionalString(20),
  email: optionalEmail(),
  address: optionalString(240),
  gstNumber: optionalString(20),
  paymentTerms: optionalString(60),
  notes: optionalString(300),
  isActive: z.boolean().default(true),
});

export const stockMovementSchema = z
  .object({
    ingredientId: idField("Ingredient"),
    type: z.enum(["ADD", "ADJUST", "TRANSFER_OUT", "TRANSFER_IN"]),
    /** ADD/TRANSFER: positive quantity. ADJUST: the counted stock level. */
    quantity: numberField("Quantity", { min: 0 }),
    unitCost: z.union([z.string(), z.number()]).optional().nullable(),
    reason: optionalString(200),
    counterparty: optionalString(80),
  })
  .refine((v) => v.type === "ADJUST" || v.quantity > 0, { path: ["quantity"], message: "Quantity must be greater than zero" })
  .refine((v) => !v.type.startsWith("TRANSFER") || !!v.counterparty, {
    path: ["counterparty"],
    message: "Enter where the stock is going to / coming from",
  });

export const wasteSchema = z.object({
  ingredientId: idField("Ingredient"),
  quantity: numberField("Quantity", { min: 0.001 }),
  unit: z.enum(STOCK_UNIT_VALUES),
  reason: requiredString("Reason", 40),
  notes: optionalString(200),
});

export const purchaseSchema = z.object({
  id: z.string().optional(),
  supplierId: optionalId(),
  invoiceNumber: optionalString(40),
  status: z.enum(["DRAFT", "ORDERED", "RECEIVED"]),
  notes: optionalString(300),
  taxAmount: moneyField("Tax"),
  items: z
    .array(
      z.object({
        ingredientId: idField("Ingredient"),
        quantity: numberField("Quantity", { min: 0.001 }),
        unitCost: moneyField("Unit cost"),
      }),
    )
    .min(1, "Add at least one item"),
});

export const receivePurchaseSchema = z.object({ id: idField("Purchase") });

export const recipeSchema = z.object({
  productId: idField("Dish"),
  yieldQuantity: numberField("Yield", { min: 1, max: 500, int: true }),
  wastePercent: numberField("Waste %", { min: 0, max: 90 }),
  targetFoodCost: numberField("Target food cost", { min: 5, max: 90 }),
  instructions: optionalString(4000),
  prepTimeMinutes: optionalNumberField("Prep time", { min: 0, max: 600, int: true }),
  ingredients: z
    .array(
      z.object({
        ingredientId: idField("Ingredient"),
        quantity: numberField("Quantity", { min: 0.001 }),
        unit: z.enum(STOCK_UNIT_VALUES),
        wastePercent: numberField("Waste %", { min: 0, max: 90 }),
      }),
    )
    .min(1, "Add at least one ingredient"),
});

export const loyaltyProgramSchema = z.object({
  isEnabled: z.boolean(),
  pointsPerHundred: numberField("Points per ₹100", { min: 0, max: 1000, int: true }),
  pointValue: moneyField("Point value", { min: 0.01, max: 100 }),
  minRedeemPoints: numberField("Minimum redemption", { min: 0, int: true }),
  maxRedeemPercent: numberField("Maximum redemption", { min: 1, max: 100, int: true }),
  expiryDays: optionalNumberField("Expiry period", { min: 1, max: 3650, int: true }),
  signupBonus: numberField("Signup bonus", { min: 0, max: 100000, int: true }),
  birthdayBonus: numberField("Birthday bonus", { min: 0, max: 100000, int: true }),
});

export const loyaltyAdjustSchema = z.object({
  customerId: idField("Customer"),
  points: numberField("Points", { int: true, min: -1_000_000, max: 1_000_000 }).refine((n) => n !== 0, "Points can't be zero"),
  reason: requiredString("Reason", 160),
});

export const integrationSettingsSchema = z.object({
  provider: z.enum(["SWIGGY", "ZOMATO"]),
  storeId: optionalString(60),
  autoAcceptOrders: z.boolean(),
  autoSyncMenu: z.boolean(),
  syncInventory: z.boolean(),
  syncPricing: z.boolean(),
});

export const integrationCredentialsSchema = z.object({
  provider: z.enum(["SWIGGY", "ZOMATO"]),
  apiKey: requiredString("API key", 400),
  apiSecret: requiredString("API secret", 400),
  webhookSecret: requiredString("Webhook secret", 400),
});

export const apiKeySchema = z.object({
  name: requiredString("Key name", 60),
  scopes: z.array(z.enum(["menu:read", "orders:read", "orders:write", "customers:write"])).min(1, "Pick at least one scope"),
});

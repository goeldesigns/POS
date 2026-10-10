"use server";

import { z } from "zod";
import { idSchema } from "@/lib/validation/operations";
import { ingredientSchema, purchaseSchema, receivePurchaseSchema, recipeSchema, stockMovementSchema, supplierSchema, wasteSchema } from "@/lib/validation/inventory";
import { restaurantAction } from "../action";
import { cancelPurchase, deleteIngredient, deleteSupplier, receivePurchase, recordMovement, recordWaste, saveIngredient, savePurchase, saveSupplier } from "../services/inventory";
import { deleteRecipe, saveRecipe } from "../services/recipes";

export const saveIngredientAction = restaurantAction({ permission: ["inventory.create", "inventory.edit"], schema: ingredientSchema }, async (input, ctx) => ({
  id: await saveIngredient(ctx, input),
}));
export const deleteIngredientAction = restaurantAction({ permission: "inventory.delete", schema: idSchema }, async (input, ctx) => ({ result: await deleteIngredient(ctx, input.id) }));
export const stockMovementAction = restaurantAction(
  { permission: ["inventory.add_stock", "inventory.adjust_stock", "inventory.transfer_stock"], schema: stockMovementSchema },
  (input, ctx) =>
    recordMovement(ctx, {
      ...input,
      unitCost: input.unitCost != null && input.unitCost !== "" ? Math.round(Number(input.unitCost) * 100) : null,
    }),
);
export const recordWasteAction = restaurantAction({ permission: "inventory.adjust_stock", schema: wasteSchema }, (input, ctx) => recordWaste(ctx, input));
export const saveSupplierAction = restaurantAction({ permission: ["inventory.create", "inventory.edit"], schema: supplierSchema }, async (input, ctx) => ({ id: await saveSupplier(ctx, input) }));
export const deleteSupplierAction = restaurantAction({ permission: "inventory.delete", schema: idSchema }, async (input, ctx) => ({ result: await deleteSupplier(ctx, input.id) }));
export const savePurchaseAction = restaurantAction({ permission: "inventory.add_stock", schema: purchaseSchema }, async (input, ctx) => ({ id: await savePurchase(ctx, input) }));
export const receivePurchaseAction = restaurantAction({ permission: "inventory.add_stock", schema: receivePurchaseSchema }, (input, ctx) => receivePurchase(ctx, input.id));
export const cancelPurchaseAction = restaurantAction({ permission: "inventory.add_stock", schema: idSchema }, (input, ctx) => cancelPurchase(ctx, input.id));
export const saveRecipeAction = restaurantAction({ permission: ["recipes.create", "recipes.edit"], schema: recipeSchema }, (input, ctx) => saveRecipe(ctx, input));
export const deleteRecipeAction = restaurantAction({ permission: "recipes.delete", schema: z.object({ productId: z.string().min(1) }) }, (input, ctx) => deleteRecipe(ctx, input.productId));

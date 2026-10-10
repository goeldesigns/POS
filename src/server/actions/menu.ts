"use server";

import { categorySchema, modifierGroupSchema, productSchema, toggleProductSchema } from "@/lib/validation/menu";
import { idSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { deleteCategory, deleteModifierGroup, deleteProduct, saveCategory, saveModifierGroup, saveProduct, toggleProductFlag } from "../services/menu";

export const saveProductAction = restaurantAction({ permission: ["menu.create", "menu.edit"], schema: productSchema }, async (input, ctx) => ({
  id: await saveProduct(ctx, input),
}));
export const toggleProductAction = restaurantAction({ permission: "menu.edit", schema: toggleProductSchema }, (input, ctx) =>
  toggleProductFlag(ctx, input.id, input.field, input.value),
);
export const deleteProductAction = restaurantAction({ permission: "menu.delete", schema: idSchema }, (input, ctx) => deleteProduct(ctx, input.id));
export const saveCategoryAction = restaurantAction({ permission: ["menu.create", "menu.edit"], schema: categorySchema }, (input, ctx) => saveCategory(ctx, input));
export const deleteCategoryAction = restaurantAction({ permission: "menu.delete", schema: idSchema }, (input, ctx) => deleteCategory(ctx, input.id));
export const saveModifierGroupAction = restaurantAction({ permission: ["menu.create", "menu.edit"], schema: modifierGroupSchema }, (input, ctx) =>
  saveModifierGroup(ctx, input),
);
export const deleteModifierGroupAction = restaurantAction({ permission: "menu.delete", schema: idSchema }, (input, ctx) => deleteModifierGroup(ctx, input.id));

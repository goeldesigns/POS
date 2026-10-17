import type { FoodType, StockUnit } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import type { SearchParams } from "../list-params";

interface RecipeRowWire {
  productId: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
  ingredients: number;
  cost: number | null;
  foodCostPercent: number | null;
  target: number | null;
  suggestedPrice: number | null;
  margin: number | null;
  state: "missing" | "high" | "ok";
}

export async function listRecipes(_ctx: ServiceContext, sp: SearchParams) {
  return backend.get<{
    rows: RecipeRowWire[];
    stats: { total: number; costed: number; missing: number; high: number; avgFoodCost: number | null };
    categories: { id: string; name: string }[];
  }>("/api/v1/recipes", pick(sp, "q", "category", "status"));
}

export type RecipeRow = Awaited<ReturnType<typeof listRecipes>>["rows"][number];

interface EditorWire {
  product: { id: string; name: string; category: string; price: number; foodType: FoodType; imageUrl: string | null; preparationTime: number | null };
  recipe: {
    yieldQuantity: number;
    wastePercent: number;
    targetFoodCost: number;
    instructions: string | null;
    prepTimeMinutes: number | null;
    lines: { ingredientId: string; quantity: number; unit: StockUnit; wastePercent: number }[];
  } | null;
  ingredients: { id: string; name: string; sku: string; unit: StockUnit; costPerUnit: number; currentStock: number; category: string }[];
}

export async function getRecipeEditor(_ctx: ServiceContext, productId: string) {
  const { product, recipe, ingredients } = await backend.get<EditorWire>(`/api/v1/recipes/${productId}`);
  return {
    product: {
      ...product,
      category: { name: product.category },
      recipe: recipe ? { ...recipe, ingredients: recipe.lines } : null,
    },
    ingredients,
  };
}

export interface RecipeInput {
  productId: string;
  yieldQuantity: number;
  wastePercent: number;
  targetFoodCost: number;
  instructions: string | null;
  prepTimeMinutes: number | null;
  ingredients: { ingredientId: string; quantity: number; unit: StockUnit; wastePercent: number }[];
}

export async function saveRecipe(_ctx: ServiceContext, input: RecipeInput) {
  const { productId, ...body } = input;
  await backend.put(`/api/v1/recipes/${productId}`, body);
}

export async function deleteRecipe(_ctx: ServiceContext, productId: string) {
  await backend.delete(`/api/v1/recipes/${productId}`);
}

import type { StockUnit } from "@/generated/prisma/enums";
import { costRecipe } from "@/lib/recipe-cost";
import { unitsCompatible, UNIT_LABELS } from "@/lib/units";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { BusinessRuleError, NotFoundError } from "../errors";
import { param, type SearchParams } from "../list-params";

export async function listRecipes(ctx: ServiceContext, sp: SearchParams) {
  const q = (param(sp, "q") ?? "").trim();
  const category = param(sp, "category");
  const status = param(sp, "status");
  const products = await ctx.db.product.findMany({
    where: {
      deletedAt: null,
      isCombo: false,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(category ? { categoryId: category } : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    include: {
      category: { select: { name: true } },
      recipe: { include: { ingredients: { include: { ingredient: { select: { unit: true, costPerUnit: true } } } } } },
    },
  });
  const rows = products.map((p) => {
    const costing = p.recipe
      ? costRecipe({ lines: p.recipe.ingredients, yieldQuantity: p.recipe.yieldQuantity, wastePercent: p.recipe.wastePercent, targetFoodCost: p.recipe.targetFoodCost, sellingPrice: p.price })
      : null;
    const state = !p.recipe ? "missing" : costing!.foodCostPercent != null && costing!.foodCostPercent > p.recipe.targetFoodCost ? "high" : "ok";
    return {
      productId: p.id,
      name: p.name,
      category: p.category.name,
      price: p.price,
      imageUrl: p.imageUrl,
      ingredients: p.recipe?.ingredients.length ?? 0,
      cost: costing?.portionCost ?? null,
      foodCostPercent: costing?.foodCostPercent ?? null,
      target: p.recipe?.targetFoodCost ?? null,
      suggestedPrice: costing?.suggestedPrice ?? null,
      margin: costing?.margin ?? null,
      state,
    };
  });
  const filtered = status ? rows.filter((r) => r.state === status) : rows;
  const costed = rows.filter((r) => r.cost != null && r.foodCostPercent != null);
  return {
    rows: filtered,
    stats: {
      total: rows.length,
      costed: costed.length,
      missing: rows.filter((r) => r.state === "missing").length,
      high: rows.filter((r) => r.state === "high").length,
      avgFoodCost: costed.length ? costed.reduce((s, r) => s + r.foodCostPercent!, 0) / costed.length : null,
    },
  };
}

export type RecipeRow = Awaited<ReturnType<typeof listRecipes>>["rows"][number];

export async function getRecipeEditor(ctx: ServiceContext, productId: string) {
  const [product, ingredients] = await Promise.all([
    ctx.db.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { category: { select: { name: true } }, recipe: { include: { ingredients: true } } },
    }),
    ctx.db.ingredient.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, unit: true, costPerUnit: true, currentStock: true, category: true } }),
  ]);
  if (!product) throw new NotFoundError("Menu item");
  if (product.isCombo) throw new BusinessRuleError("Combos use the recipes of the items they contain");
  return { product, ingredients };
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

export async function saveRecipe(ctx: ServiceContext, input: RecipeInput) {
  const existing = await ctx.db.recipe.findUnique({ where: { productId: input.productId } });
  assertPermission(ctx, existing ? "recipes.edit" : "recipes.create");
  const product = await ctx.db.product.findFirst({ where: { id: input.productId, deletedAt: null } });
  if (!product) throw new NotFoundError("Menu item");
  const ids = [...new Set(input.ingredients.map((i) => i.ingredientId))];
  if (ids.length !== input.ingredients.length) throw new BusinessRuleError("Each ingredient can only appear once — combine the quantities");
  const ingredients = await ctx.db.ingredient.findMany({ where: { id: { in: ids } } });
  if (ingredients.length !== ids.length) throw new NotFoundError("Ingredient");
  for (const line of input.ingredients) {
    const ing = ingredients.find((i) => i.id === line.ingredientId)!;
    if (!unitsCompatible(line.unit, ing.unit)) {
      throw new BusinessRuleError(`${ing.name} is stocked in ${UNIT_LABELS[ing.unit]} — use a compatible unit`);
    }
  }
  const data = {
    yieldQuantity: input.yieldQuantity,
    wastePercent: input.wastePercent,
    targetFoodCost: input.targetFoodCost,
    instructions: input.instructions,
    prepTimeMinutes: input.prepTimeMinutes,
  };
  await ctx.db.$transaction(async (tx) => {
    const recipe = existing
      ? await tx.recipe.update({ where: { id: existing.id }, data })
      : await tx.recipe.create({ data: { ...data, restaurantId: ctx.restaurantId, productId: input.productId } });
    await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    await tx.recipeIngredient.createMany({
      data: input.ingredients.map((l) => ({ restaurantId: ctx.restaurantId, recipeId: recipe.id, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, wastePercent: l.wastePercent })),
    });
  });
  await audit(ctx, { action: existing ? "recipe.updated" : "recipe.created", entity: "Recipe", entityId: input.productId, summary: `${ctx.actor.name} ${existing ? "updated" : "created"} the recipe for ${product.name}` });
}

export async function deleteRecipe(ctx: ServiceContext, productId: string) {
  assertPermission(ctx, "recipes.delete");
  const recipe = await ctx.db.recipe.findUnique({ where: { productId }, include: { product: { select: { name: true } } } });
  if (!recipe) throw new NotFoundError("Recipe");
  await ctx.db.recipe.delete({ where: { id: recipe.id } });
  await audit(ctx, { action: "recipe.deleted", entity: "Recipe", entityId: productId, summary: `${ctx.actor.name} deleted the recipe for ${recipe.product.name}` });
}

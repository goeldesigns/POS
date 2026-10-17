import type { StockUnit } from "@/lib/enums";
import { convertQuantity, unitsCompatible } from "./units";

export interface CostLine {
  quantity: number;
  unit: StockUnit;
  wastePercent: number;
  ingredient: { unit: StockUnit; costPerUnit: number };
}

/** Cost of one recipe line in minor units (includes recipe + line waste). */
export function lineCost(line: CostLine, recipeWastePercent: number): number {
  if (!unitsCompatible(line.unit, line.ingredient.unit) || !Number.isFinite(line.quantity)) return 0;
  const qty = convertQuantity(line.quantity, line.unit, line.ingredient.unit);
  return qty * line.ingredient.costPerUnit * (1 + (recipeWastePercent + line.wastePercent) / 100);
}

export interface RecipeCosting {
  batchCost: number;
  portionCost: number;
  foodCostPercent: number | null;
  suggestedPrice: number;
  margin: number | null;
}

/**
 * Per-portion cost, food cost % against the selling price, and a suggested
 * price that hits the target food-cost percentage (rounded up to ₹5).
 */
export function costRecipe(opts: {
  lines: CostLine[];
  yieldQuantity: number;
  wastePercent: number;
  targetFoodCost: number;
  sellingPrice: number;
}): RecipeCosting {
  const batchCost = opts.lines.reduce((s, l) => s + lineCost(l, opts.wastePercent), 0);
  const portionCost = batchCost / Math.max(1, opts.yieldQuantity);
  const target = Math.min(90, Math.max(5, opts.targetFoodCost)) / 100;
  const raw = portionCost / target;
  return {
    batchCost: Math.round(batchCost),
    portionCost: Math.round(portionCost),
    foodCostPercent: opts.sellingPrice > 0 ? (portionCost / opts.sellingPrice) * 100 : null,
    suggestedPrice: Math.ceil(raw / 500) * 500,
    margin: opts.sellingPrice > 0 ? opts.sellingPrice - Math.round(portionCost) : null,
  };
}

import type { StockTxnType, StockUnit } from "@/generated/prisma/enums";
import { convertQuantity, roundQty, UNIT_LABELS } from "@/lib/units";
import type { TenantTx } from "../tenant-db";
import type { ServiceContext } from "../auth/load-context";
import { BusinessRuleError, NotFoundError } from "../errors";

export interface StockChange {
  ingredientId: string;
  /** Signed quantity in the ingredient's own unit. */
  delta: number;
  type: StockTxnType;
  reference?: string | null;
  reason?: string | null;
  counterparty?: string | null;
  unitCost?: number | null;
  orderId?: string | null;
  purchaseId?: string | null;
  allowNegative?: boolean;
}

/** Apply one stock movement and append it to the immutable ledger. */
export async function applyStockChangeTx(tx: TenantTx, ctx: ServiceContext, change: StockChange) {
  const delta = roundQty(change.delta);
  const ingredient = await tx.ingredient.update({
    where: { id: change.ingredientId },
    data: {
      currentStock: { increment: delta },
      ...(change.type === "PURCHASE" && change.unitCost != null ? { costPerUnit: change.unitCost } : {}),
    },
  });
  const balance = roundQty(ingredient.currentStock);
  if (balance < 0 && change.allowNegative === false) {
    throw new BusinessRuleError(
      `Not enough ${ingredient.name} in stock (short by ${Math.abs(balance)} ${UNIT_LABELS[ingredient.unit]})`,
    );
  }
  await tx.stockTransaction.create({
    data: {
      restaurantId: ctx.restaurantId,
      ingredientId: ingredient.id,
      type: change.type,
      quantity: delta,
      balanceAfter: balance,
      unitCost: change.unitCost ?? ingredient.costPerUnit,
      reference: change.reference ?? null,
      reason: change.reason ?? null,
      counterparty: change.counterparty ?? null,
      orderId: change.orderId ?? null,
      purchaseId: change.purchaseId ?? null,
      createdById: ctx.actor.userId,
      actorName: ctx.actor.name,
    },
  });
  return ingredient;
}

interface DeductionLine {
  productId: string | null;
  quantity: number;
}

/**
 * Work out ingredient usage for a set of sold lines from recipe configuration.
 * Combos expand to their component products. Quantities are returned in each
 * ingredient's stock unit and include recipe + line waste.
 */
export async function ingredientUsageFor(tx: TenantTx, lines: readonly DeductionLine[]) {
  const qtyByProduct = new Map<string, number>();
  const add = (id: string, qty: number) => qtyByProduct.set(id, (qtyByProduct.get(id) ?? 0) + qty);

  const productIds = [...new Set(lines.map((l) => l.productId).filter((id): id is string => !!id))];
  if (productIds.length === 0) return new Map<string, { quantity: number; unit: StockUnit; name: string }>();

  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, isCombo: true, trackStock: true, comboItems: { select: { productId: true, quantity: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const line of lines) {
    if (!line.productId) continue;
    const product = byId.get(line.productId);
    if (!product || !product.trackStock) continue;
    if (product.isCombo) {
      for (const component of product.comboItems) add(component.productId, component.quantity * line.quantity);
    } else {
      add(product.id, line.quantity);
    }
  }

  const recipes = await tx.recipe.findMany({
    where: { productId: { in: [...qtyByProduct.keys()] } },
    include: { ingredients: { include: { ingredient: { select: { id: true, unit: true, name: true } } } } },
  });

  const usage = new Map<string, { quantity: number; unit: StockUnit; name: string }>();
  for (const recipe of recipes) {
    const sold = qtyByProduct.get(recipe.productId) ?? 0;
    if (sold <= 0) continue;
    const portions = sold / Math.max(1, recipe.yieldQuantity);
    for (const line of recipe.ingredients) {
      const wasteFactor = 1 + (recipe.wastePercent + line.wastePercent) / 100;
      const qtyInStockUnit = convertQuantity(line.quantity, line.unit, line.ingredient.unit) * portions * wasteFactor;
      const current = usage.get(line.ingredientId) ?? { quantity: 0, unit: line.ingredient.unit, name: line.ingredient.name };
      current.quantity += qtyInStockUnit;
      usage.set(line.ingredientId, current);
    }
  }
  return usage;
}

/** Deduct recipe ingredients for a completed order (idempotent via order flag). */
export async function deductInventoryForOrderTx(
  tx: TenantTx,
  ctx: ServiceContext,
  order: { id: string; orderNumber: string; inventoryDeducted: boolean },
  opts: { allowNegative: boolean },
) {
  if (order.inventoryDeducted) return 0;
  const items = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { productId: true, quantity: true } });
  const usage = await ingredientUsageFor(tx, items);
  for (const [ingredientId, u] of usage) {
    await applyStockChangeTx(tx, ctx, {
      ingredientId,
      delta: -u.quantity,
      type: "SALE",
      reference: order.orderNumber,
      reason: "Sold",
      orderId: order.id,
      allowNegative: opts.allowNegative,
    });
  }
  await tx.order.update({ where: { id: order.id }, data: { inventoryDeducted: true } });
  return usage.size;
}

export async function getIngredientOrThrow(tx: TenantTx, id: string) {
  const ingredient = await tx.ingredient.findUnique({ where: { id } });
  if (!ingredient) throw new NotFoundError("Ingredient");
  return ingredient;
}

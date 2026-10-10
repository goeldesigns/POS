import type { Prisma } from "@/generated/prisma/client";
import type { StockUnit } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { convertQuantity, roundQty, unitsCompatible, UNIT_LABELS } from "@/lib/units";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "../errors";
import { parseListParams, param, type SearchParams } from "../list-params";
import { applyStockChangeTx, getIngredientOrThrow } from "./stock";

const EXPIRING_DAYS = 3;

// ─── Overview ───────────────────────────────────────────────────────────────

export async function inventoryOverview(ctx: ServiceContext) {
  const [ingredients, recent] = await Promise.all([
    ctx.db.ingredient.findMany({ where: { isActive: true }, include: { supplier: { select: { name: true } } } }),
    ctx.db.stockTransaction.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12, include: { ingredient: { select: { name: true, unit: true } } } }),
  ]);
  const soon = Date.now() + EXPIRING_DAYS * 86_400_000;
  const low = ingredients.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock);
  const out = ingredients.filter((i) => i.currentStock <= 0);
  const expiring = ingredients.filter((i) => i.expiryDate && i.expiryDate.getTime() <= soon).sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime());
  const value = (i: (typeof ingredients)[number]) => Math.round(Math.max(0, i.currentStock) * i.costPerUnit);
  const byCategory = new Map<string, number>();
  for (const i of ingredients) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + value(i));
  return {
    stats: {
      total: ingredients.length,
      low: low.length,
      out: out.length,
      value: ingredients.reduce((s, i) => s + value(i), 0),
      expiring: expiring.length,
    },
    lowItems: [...out, ...low].slice(0, 8).map((i) => ({ id: i.id, name: i.name, stock: i.currentStock, min: i.minStock, unit: i.unit, supplier: i.supplier?.name ?? null })),
    expiringItems: expiring.slice(0, 8).map((i) => ({ id: i.id, name: i.name, stock: i.currentStock, unit: i.unit, expiryDate: i.expiryDate!.toISOString() })),
    valueByCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, value: v })),
    recent: recent.map((t) => ({ id: t.id, name: t.ingredient.name, unit: t.ingredient.unit, type: t.type, quantity: t.quantity, reference: t.reference, reason: t.reason, actorName: t.actorName, createdAt: t.createdAt.toISOString() })),
  };
}

// ─── Ingredients ────────────────────────────────────────────────────────────

export async function listIngredients(ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["name", "currentStock", "updatedAt"] as const, defaultSort: "name", defaultDir: "asc", defaultPageSize: 50 });
  const and: Prisma.IngredientWhereInput[] = [{ isActive: param(sp, "archived") === "1" ? false : true }];
  if (p.q) and.push({ OR: [{ name: { contains: p.q, mode: "insensitive" } }, { sku: { contains: p.q, mode: "insensitive" } }, { supplier: { name: { contains: p.q, mode: "insensitive" } } }] });
  const category = param(sp, "category");
  if (category) and.push({ category });
  const where: Prisma.IngredientWhereInput = { AND: and };
  const filter = param(sp, "filter");
  const all = await ctx.db.ingredient.findMany({
    where,
    orderBy: { [p.sort]: p.dir },
    include: { supplier: { select: { id: true, name: true } } },
  });
  const soon = Date.now() + EXPIRING_DAYS * 86_400_000;
  const filtered = all.filter((i) =>
    filter === "low" ? i.currentStock <= i.minStock : filter === "out" ? i.currentStock <= 0 : filter === "expiring" ? !!i.expiryDate && i.expiryDate.getTime() <= soon : true,
  );
  const categories = await ctx.db.ingredient.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } });
  return {
    params: p,
    total: filtered.length,
    categories: categories.map((c) => c.category),
    rows: filtered.slice(p.skip, p.skip + p.pageSize).map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      category: i.category,
      unit: i.unit,
      currentStock: roundQty(i.currentStock),
      minStock: i.minStock,
      maxStock: i.maxStock,
      costPerUnit: i.costPerUnit,
      value: Math.round(Math.max(0, i.currentStock) * i.costPerUnit),
      supplier: i.supplier,
      expiryDate: i.expiryDate?.toISOString() ?? null,
      storageLocation: i.storageLocation,
      isActive: i.isActive,
      state: i.currentStock <= 0 ? "out" : i.currentStock <= i.minStock ? "low" : i.maxStock && i.currentStock > i.maxStock ? "over" : "ok",
      expiringSoon: !!i.expiryDate && i.expiryDate.getTime() <= soon,
    })),
  };
}

export type IngredientRow = Awaited<ReturnType<typeof listIngredients>>["rows"][number];

export interface IngredientInput {
  id?: string;
  name: string;
  sku: string;
  category: string;
  unit: StockUnit;
  minStock: number;
  maxStock: number | null;
  costPerUnit: number;
  supplierId: string | null;
  expiryDate: Date | null;
  storageLocation: string | null;
  openingStock: number | null;
  isActive: boolean;
}

export async function saveIngredient(ctx: ServiceContext, input: IngredientInput) {
  assertPermission(ctx, input.id ? "inventory.edit" : "inventory.create");
  const clash = await ctx.db.ingredient.findFirst({ where: { sku: input.sku, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new ConflictError(`SKU ${input.sku} is already used by ${clash.name}`);
  if (input.supplierId && !(await ctx.db.supplier.findUnique({ where: { id: input.supplierId } }))) throw new NotFoundError("Supplier");
  const { id, openingStock, ...data } = input;
  if (id) {
    const before = await getIngredientOrThrow(ctx.db, id);
    if (before.unit !== input.unit && before.currentStock !== 0) {
      throw new BusinessRuleError("Change the unit only when stock is zero — or adjust stock first");
    }
    await ctx.db.ingredient.update({ where: { id }, data });
    await audit(ctx, { action: "ingredient.updated", entity: "Ingredient", entityId: id, summary: `${ctx.actor.name} updated ingredient ${input.name}` });
    return id;
  }
  return ctx.db.$transaction(async (tx) => {
    const ing = await tx.ingredient.create({ data: { ...data, restaurantId: ctx.restaurantId, currentStock: 0 } });
    if (openingStock && openingStock > 0) {
      await applyStockChangeTx(tx, ctx, { ingredientId: ing.id, delta: openingStock, type: "OPENING", reason: "Opening stock", unitCost: input.costPerUnit });
    }
    await audit(ctx, { action: "ingredient.created", entity: "Ingredient", entityId: ing.id, summary: `${ctx.actor.name} added ingredient ${input.name}` }, tx);
    return ing.id;
  });
}

export async function deleteIngredient(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "inventory.delete");
  const ing = await ctx.db.ingredient.findUnique({ where: { id }, include: { _count: { select: { recipeLines: true, transactions: true, purchaseItems: true } } } });
  if (!ing) throw new NotFoundError("Ingredient");
  if (ing._count.recipeLines) throw new BusinessRuleError(`${ing.name} is used in ${ing._count.recipeLines} recipes — remove it from those first`);
  if (ing._count.transactions || ing._count.purchaseItems) {
    await ctx.db.ingredient.update({ where: { id }, data: { isActive: false } });
    return "archived" as const;
  }
  await ctx.db.ingredient.delete({ where: { id } });
  return "deleted" as const;
}

// ─── Stock movements ────────────────────────────────────────────────────────

export async function recordMovement(
  ctx: ServiceContext,
  input: { ingredientId: string; type: "ADD" | "ADJUST" | "TRANSFER_OUT" | "TRANSFER_IN"; quantity: number; unitCost?: number | null; reason: string | null; counterparty: string | null },
) {
  assertPermission(ctx, input.type === "ADD" ? "inventory.add_stock" : input.type === "ADJUST" ? "inventory.adjust_stock" : "inventory.transfer_stock");
  return ctx.db.$transaction(async (tx) => {
    const ing = await getIngredientOrThrow(tx, input.ingredientId);
    let delta = input.quantity;
    let type: "PURCHASE" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT" = "PURCHASE";
    if (input.type === "ADJUST") {
      delta = roundQty(input.quantity - ing.currentStock);
      type = "ADJUSTMENT";
      if (delta === 0) throw new BusinessRuleError("The counted quantity matches current stock — nothing to adjust");
    } else if (input.type === "TRANSFER_OUT") {
      delta = -input.quantity;
      type = "TRANSFER_OUT";
      if (ing.currentStock < input.quantity) throw new BusinessRuleError(`Only ${roundQty(ing.currentStock)} ${UNIT_LABELS[ing.unit]} of ${ing.name} in stock`);
    } else if (input.type === "TRANSFER_IN") type = "TRANSFER_IN";

    const updated = await applyStockChangeTx(tx, ctx, {
      ingredientId: ing.id,
      delta,
      type,
      reason: input.reason ?? (input.type === "ADD" ? "Manual stock in" : input.type === "ADJUST" ? "Stock count" : null),
      counterparty: input.counterparty,
      unitCost: input.type === "ADD" && input.unitCost ? input.unitCost : null,
    });
    await audit(
      ctx,
      {
        action: "inventory.adjusted",
        entity: "Ingredient",
        entityId: ing.id,
        summary: `${ctx.actor.name} ${type === "ADJUSTMENT" ? "adjusted" : type === "PURCHASE" ? "added" : "transferred"} ${ing.name} by ${delta > 0 ? "+" : ""}${roundQty(delta)} ${UNIT_LABELS[ing.unit]}`,
      },
      tx,
    );
    return { balance: roundQty(updated.currentStock) };
  });
}

export async function recordWaste(ctx: ServiceContext, input: { ingredientId: string; quantity: number; unit: StockUnit; reason: string; notes: string | null }) {
  assertPermission(ctx, "inventory.adjust_stock");
  return ctx.db.$transaction(async (tx) => {
    const ing = await getIngredientOrThrow(tx, input.ingredientId);
    if (!unitsCompatible(input.unit, ing.unit)) throw new BusinessRuleError(`${ing.name} is measured in ${UNIT_LABELS[ing.unit]}`);
    const qty = convertQuantity(input.quantity, input.unit, ing.unit);
    const cost = Math.round(qty * ing.costPerUnit);
    await applyStockChangeTx(tx, ctx, { ingredientId: ing.id, delta: -qty, type: "WASTE", reason: input.reason });
    await tx.waste.create({ data: { restaurantId: ctx.restaurantId, ingredientId: ing.id, quantity: input.quantity, unit: input.unit, reason: input.reason, notes: input.notes, cost, recordedBy: ctx.actor.name } });
    await audit(ctx, { action: "inventory.waste", entity: "Ingredient", entityId: ing.id, summary: `${ctx.actor.name} recorded waste: ${input.quantity} ${UNIT_LABELS[input.unit]} ${ing.name} (${formatMoney(cost)})` }, tx);
  });
}

export async function listMovements(ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 50 });
  const and: Prisma.StockTransactionWhereInput[] = [];
  const type = param(sp, "type");
  if (type) and.push({ type: type as never });
  const ingredient = param(sp, "ingredient");
  if (ingredient) and.push({ ingredientId: ingredient });
  if (p.q) and.push({ OR: [{ ingredient: { name: { contains: p.q, mode: "insensitive" } } }, { reference: { contains: p.q, mode: "insensitive" } }] });
  const where = and.length ? { AND: and } : {};
  const [rows, total] = await Promise.all([
    ctx.db.stockTransaction.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: p.skip, take: p.pageSize, include: { ingredient: { select: { name: true, unit: true, sku: true } } } }),
    ctx.db.stockTransaction.count({ where }),
  ]);
  return {
    params: p,
    total,
    rows: rows.map((t) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      ingredient: t.ingredient.name,
      sku: t.ingredient.sku,
      unit: t.ingredient.unit,
      type: t.type,
      quantity: t.quantity,
      balanceAfter: t.balanceAfter,
      value: Math.round(Math.abs(t.quantity) * (t.unitCost ?? 0)),
      reference: t.reference,
      reason: t.reason,
      counterparty: t.counterparty,
      actorName: t.actorName,
    })),
  };
}

export async function listWaste(ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt", "cost"] as const, defaultSort: "createdAt", defaultPageSize: 50 });
  const [rows, total, agg] = await Promise.all([
    ctx.db.waste.findMany({ orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.pageSize, include: { ingredient: { select: { name: true } } } }),
    ctx.db.waste.count(),
    ctx.db.waste.aggregate({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _sum: { cost: true } }),
  ]);
  return {
    params: p,
    total,
    last30: agg._sum.cost ?? 0,
    rows: rows.map((w) => ({ id: w.id, createdAt: w.createdAt.toISOString(), ingredient: w.ingredient.name, quantity: w.quantity, unit: w.unit, reason: w.reason, cost: w.cost, notes: w.notes, recordedBy: w.recordedBy })),
  };
}

// ─── Suppliers ──────────────────────────────────────────────────────────────

export async function listSuppliers(ctx: ServiceContext) {
  const rows = await ctx.db.supplier.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { ingredients: true } }, purchases: { where: { status: "RECEIVED" }, select: { total: true, receivedAt: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    gstNumber: s.gstNumber,
    paymentTerms: s.paymentTerms,
    notes: s.notes,
    isActive: s.isActive,
    ingredients: s._count.ingredients,
    purchased: s.purchases.reduce((a, p) => a + p.total, 0),
    lastPurchase: s.purchases.map((p) => p.receivedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]?.toISOString() ?? null,
  }));
}

export type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>[number];

export async function saveSupplier(
  ctx: ServiceContext,
  input: { id?: string; name: string; contactPerson: string | null; phone: string | null; email: string | null; address: string | null; gstNumber: string | null; paymentTerms: string | null; notes: string | null; isActive: boolean },
) {
  assertPermission(ctx, input.id ? "inventory.edit" : "inventory.create");
  const { id, ...data } = input;
  if (id) {
    await ctx.db.supplier.update({ where: { id }, data });
    return id;
  }
  return (await ctx.db.supplier.create({ data: { ...data, restaurantId: ctx.restaurantId } })).id;
}

export async function deleteSupplier(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "inventory.delete");
  const s = await ctx.db.supplier.findUnique({ where: { id }, include: { _count: { select: { purchases: true } } } });
  if (!s) throw new NotFoundError("Supplier");
  if (s._count.purchases) {
    await ctx.db.supplier.update({ where: { id }, data: { isActive: false } });
    return "archived" as const;
  }
  await ctx.db.supplier.delete({ where: { id } });
  return "deleted" as const;
}

// ─── Purchases ──────────────────────────────────────────────────────────────

export async function listPurchases(ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt", "total"] as const, defaultSort: "createdAt", defaultPageSize: 20 });
  const status = param(sp, "status");
  const where: Prisma.PurchaseWhereInput = status ? { status: status as never } : {};
  const [rows, total] = await Promise.all([
    ctx.db.purchase.findMany({
      where,
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
      include: { supplier: { select: { name: true } }, items: { include: { ingredient: { select: { name: true, unit: true } } } } },
    }),
    ctx.db.purchase.count({ where }),
  ]);
  return {
    params: p,
    total,
    rows: rows.map((x) => ({
      id: x.id,
      reference: x.reference,
      invoiceNumber: x.invoiceNumber,
      supplierId: x.supplierId,
      supplier: x.supplier?.name ?? null,
      status: x.status,
      subtotal: x.subtotal,
      taxAmount: x.taxAmount,
      total: x.total,
      notes: x.notes,
      createdAt: x.createdAt.toISOString(),
      receivedAt: x.receivedAt?.toISOString() ?? null,
      items: x.items.map((i) => ({ ingredientId: i.ingredientId, name: i.ingredient.name, unit: i.ingredient.unit, quantity: i.quantity, unitCost: i.unitCost, total: i.total })),
    })),
  };
}

export type PurchaseRow = Awaited<ReturnType<typeof listPurchases>>["rows"][number];

export async function savePurchase(
  ctx: ServiceContext,
  input: { id?: string; supplierId: string | null; invoiceNumber: string | null; status: "DRAFT" | "ORDERED" | "RECEIVED"; notes: string | null; taxAmount: number; items: { ingredientId: string; quantity: number; unitCost: number }[] },
) {
  assertPermission(ctx, "inventory.add_stock");
  if (input.supplierId && !(await ctx.db.supplier.findUnique({ where: { id: input.supplierId } }))) throw new NotFoundError("Supplier");
  const ingredients = await ctx.db.ingredient.findMany({ where: { id: { in: input.items.map((i) => i.ingredientId) } } });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  if (input.items.some((i) => !byId.has(i.ingredientId))) throw new NotFoundError("Ingredient");
  const lines = input.items.map((i) => ({ ...i, unit: byId.get(i.ingredientId)!.unit, total: Math.round(i.quantity * i.unitCost) }));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  const purchaseId = await ctx.db.$transaction(async (tx) => {
    let id = input.id;
    const data = {
      supplierId: input.supplierId,
      invoiceNumber: input.invoiceNumber,
      status: input.status === "RECEIVED" ? ("ORDERED" as const) : input.status,
      notes: input.notes,
      subtotal,
      taxAmount: input.taxAmount,
      total: subtotal + input.taxAmount,
      orderedAt: input.status !== "DRAFT" ? new Date() : null,
    };
    if (id) {
      const existing = await tx.purchase.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Purchase");
      if (existing.status === "RECEIVED" || existing.status === "CANCELLED") throw new BusinessRuleError(`${existing.reference} is ${existing.status.toLowerCase()} and can't be edited`);
      await tx.purchase.update({ where: { id }, data });
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
    } else {
      const counter = await tx.restaurantSettings.update({ where: { restaurantId: ctx.restaurantId }, data: { nextPurchaseNumber: { increment: 1 } }, select: { nextPurchaseNumber: true } });
      const reference = `PO-${String(counter.nextPurchaseNumber - 1).padStart(4, "0")}`;
      id = (await tx.purchase.create({ data: { ...data, restaurantId: ctx.restaurantId, reference, createdById: ctx.actor.userId } })).id;
    }
    await tx.purchaseItem.createMany({ data: lines.map((l) => ({ restaurantId: ctx.restaurantId, purchaseId: id!, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost, total: l.total })) });
    return id!;
  });
  if (input.status === "RECEIVED") await receivePurchase(ctx, purchaseId);
  return purchaseId;
}

/** Receive goods: stock in every line at its purchase cost. */
export async function receivePurchase(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "inventory.add_stock");
  await ctx.db.$transaction(async (tx) => {
    const p = await tx.purchase.findUnique({ where: { id }, include: { items: true, supplier: { select: { name: true } } } });
    if (!p) throw new NotFoundError("Purchase");
    if (p.status === "RECEIVED") throw new BusinessRuleError(`${p.reference} was already received`);
    if (p.status === "CANCELLED") throw new BusinessRuleError(`${p.reference} is cancelled`);
    for (const line of p.items) {
      await applyStockChangeTx(tx, ctx, { ingredientId: line.ingredientId, delta: line.quantity, type: "PURCHASE", reference: p.reference, reason: "Goods received", unitCost: line.unitCost, purchaseId: p.id });
    }
    await tx.purchase.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    await audit(ctx, { action: "purchase.received", entity: "Purchase", entityId: id, summary: `${ctx.actor.name} received ${p.reference}${p.supplier ? ` from ${p.supplier.name}` : ""} (${formatMoney(p.total)})` }, tx);
  }, { timeout: 20_000 });
}

export async function cancelPurchase(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "inventory.add_stock");
  const p = await ctx.db.purchase.findUnique({ where: { id } });
  if (!p) throw new NotFoundError("Purchase");
  if (p.status === "RECEIVED") throw new BusinessRuleError("Received purchases can't be cancelled — adjust stock instead");
  await ctx.db.purchase.update({ where: { id }, data: { status: "CANCELLED" } });
}

import type { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/format";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { prisma } from "../db";
import { BusinessRuleError, NotFoundError, PlanLimitError } from "../errors";
import { parseListParams, param, type SearchParams } from "../list-params";

// ─── Products ───────────────────────────────────────────────────────────────

export async function listProducts(ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["name", "price", "updatedAt"] as const, defaultSort: "name", defaultDir: "asc", defaultPageSize: 50 });
  const where: Prisma.ProductWhereInput = { deletedAt: null };
  const and: Prisma.ProductWhereInput[] = [];
  if (p.q) and.push({ OR: [{ name: { contains: p.q, mode: "insensitive" } }, { sku: { contains: p.q, mode: "insensitive" } }, { barcode: { contains: p.q } }] });
  const category = param(sp, "category");
  if (category) and.push({ categoryId: category });
  const availability = param(sp, "availability");
  if (availability === "available") and.push({ isActive: true, isAvailable: true });
  if (availability === "soldout") and.push({ isActive: true, isAvailable: false });
  if (availability === "inactive") and.push({ isActive: false });
  const food = param(sp, "food");
  if (food) and.push({ foodType: food as never });
  if (param(sp, "kind") === "combo") and.push({ isCombo: true });
  if (and.length) where.AND = and;

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, total] = await Promise.all([
    ctx.db.product.findMany({
      where,
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
      include: {
        category: { select: { name: true, color: true } },
        variants: { select: { price: true } },
        recipe: { select: { id: true } },
      },
    }),
    ctx.db.product.count({ where }),
  ]);
  const sold = rows.length
    ? await ctx.db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { in: rows.map((r) => r.id) }, order: { status: "COMPLETED", createdAt: { gte: since } } },
        _sum: { quantity: true },
      })
    : [];
  const soldBy = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));
  return {
    total,
    params: p,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      imageUrl: r.imageUrl,
      category: r.category.name,
      categoryColor: r.category.color,
      price: r.price,
      fromPrice: r.variants.length ? Math.min(...r.variants.map((v) => v.price)) : null,
      foodType: r.foodType,
      isActive: r.isActive,
      isAvailable: r.isAvailable,
      isBestseller: r.isBestseller,
      isCombo: r.isCombo,
      hasRecipe: !!r.recipe,
      sold30d: soldBy.get(r.id) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export type ProductRow = Awaited<ReturnType<typeof listProducts>>["rows"][number];

export async function getProductEditorData(ctx: ServiceContext, id: string | null) {
  const [categories, taxRates, modifierGroups, comboCandidates, settings, product] = await Promise.all([
    ctx.db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    ctx.db.taxRate.findMany({ where: { isActive: true }, orderBy: { rate: "asc" }, select: { id: true, name: true, rate: true, isDefault: true } }),
    ctx.db.modifierGroup.findMany({ orderBy: { sortOrder: "asc" }, include: { modifiers: { where: { isActive: true }, select: { name: true, price: true } } } }),
    ctx.db.product.findMany({ where: { deletedAt: null, isCombo: false, ...(id ? { id: { not: id } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, price: true } }),
    ctx.db.restaurantSettings.findUnique({ where: { restaurantId: ctx.restaurantId }, select: { kitchenStations: true } }),
    id
      ? ctx.db.product.findFirst({
          where: { id, deletedAt: null },
          include: {
            variants: { orderBy: { sortOrder: "asc" } },
            modifierGroups: { select: { modifierGroupId: true } },
            comboItems: { select: { productId: true, quantity: true } },
            recipe: { select: { id: true } },
          },
        })
      : null,
  ]);
  if (id && !product) throw new NotFoundError("Menu item");
  return { categories, taxRates, modifierGroups, comboCandidates, kitchenStations: settings?.kitchenStations ?? [], product };
}

export interface ProductInput {
  id?: string;
  name: string;
  sku: string;
  categoryId: string;
  description: string | null;
  price: number;
  costPrice: number | null;
  imageUrl: string | null;
  taxRateId: string | null;
  foodType: "VEG" | "NON_VEG" | "EGG" | "VEGAN";
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  isSpicy: boolean;
  trackStock: boolean;
  preparationTime: number | null;
  barcode: string | null;
  kitchenStation: string | null;
  variants: { id?: string; name: string; price: number; isDefault: boolean }[];
  modifierGroupIds: string[];
  isCombo: boolean;
  comboItems: { productId: string; quantity: number }[];
}

export async function saveProduct(ctx: ServiceContext, input: ProductInput) {
  assertPermission(ctx, input.id ? "menu.edit" : "menu.create");
  const category = await ctx.db.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new NotFoundError("Category");
  if (input.taxRateId && !(await ctx.db.taxRate.findUnique({ where: { id: input.taxRateId } }))) throw new NotFoundError("Tax rate");

  const groups = input.modifierGroupIds.length ? await ctx.db.modifierGroup.findMany({ where: { id: { in: input.modifierGroupIds } }, select: { id: true } }) : [];
  if (groups.length !== new Set(input.modifierGroupIds).size) throw new NotFoundError("Modifier group");

  if (input.isCombo) {
    if (!input.comboItems.length) throw new BusinessRuleError("Add the items included in this combo");
    const parts = await ctx.db.product.findMany({ where: { id: { in: input.comboItems.map((c) => c.productId) }, deletedAt: null, isCombo: false } });
    if (parts.length !== new Set(input.comboItems.map((c) => c.productId)).size) throw new BusinessRuleError("Combos can only include regular menu items");
    if (input.id && input.comboItems.some((c) => c.productId === input.id)) throw new BusinessRuleError("A combo can't include itself");
  }
  const defaults = input.variants.filter((v) => v.isDefault).length;
  if (input.variants.length && defaults !== 1) input.variants = input.variants.map((v, i) => ({ ...v, isDefault: i === 0 }));

  const data = {
    name: input.name,
    sku: input.sku,
    categoryId: input.categoryId,
    description: input.description,
    price: input.variants.length ? Math.min(...input.variants.map((v) => v.price)) : input.price,
    costPrice: input.costPrice,
    imageUrl: input.imageUrl,
    taxRateId: input.taxRateId,
    foodType: input.foodType,
    isActive: input.isActive,
    isAvailable: input.isAvailable,
    isFeatured: input.isFeatured,
    isBestseller: input.isBestseller,
    isSpicy: input.isSpicy,
    trackStock: input.trackStock,
    preparationTime: input.preparationTime,
    barcode: input.barcode,
    kitchenStation: input.kitchenStation,
    isCombo: input.isCombo,
  };

  return ctx.db.$transaction(async (tx) => {
    let productId: string;
    if (input.id) {
      const before = await tx.product.findFirst({ where: { id: input.id, deletedAt: null } });
      if (!before) throw new NotFoundError("Menu item");
      await tx.product.update({ where: { id: input.id }, data });
      productId = input.id;
      const keep = input.variants.filter((v) => v.id).map((v) => v.id!);
      await tx.productVariant.deleteMany({ where: { productId, id: { notIn: keep } } });
      for (const [i, v] of input.variants.entries()) {
        if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: { name: v.name, price: v.price, isDefault: v.isDefault, sortOrder: i } });
        else await tx.productVariant.create({ data: { restaurantId: ctx.restaurantId, productId, name: v.name, price: v.price, isDefault: v.isDefault, sortOrder: i } });
      }
      if (before.price !== data.price) {
        await audit(ctx, { action: "product.price_changed", entity: "Product", entityId: productId, summary: `${ctx.actor.name} changed ${input.name} price from ${formatMoney(before.price)} to ${formatMoney(data.price)}` }, tx);
      } else {
        await audit(ctx, { action: "product.updated", entity: "Product", entityId: productId, summary: `${ctx.actor.name} updated ${input.name}` }, tx);
      }
    } else {
      const sub = await tx.subscription.findFirst({ include: { plan: true } });
      if (sub?.plan.maxProducts) {
        const count = await tx.product.count({ where: { deletedAt: null } });
        if (count >= sub.plan.maxProducts) throw new PlanLimitError(`The ${sub.plan.name} plan allows ${sub.plan.maxProducts} menu items.`);
      }
      const p = await tx.product.create({
        data: {
          ...data,
          restaurantId: ctx.restaurantId,
          variants: { create: input.variants.map((v, i) => ({ restaurantId: ctx.restaurantId, name: v.name, price: v.price, isDefault: v.isDefault, sortOrder: i })) },
        },
      });
      productId = p.id;
      await audit(ctx, { action: "product.created", entity: "Product", entityId: productId, summary: `${ctx.actor.name} added ${input.name} (${formatMoney(data.price)}) to the menu` }, tx);
    }
    // Join table has no tenant column (passes through the tenant extension); the product was verified above.
    await tx.productModifierGroup.deleteMany({ where: { productId } });
    if (input.modifierGroupIds.length) {
      await tx.productModifierGroup.createMany({ data: [...new Set(input.modifierGroupIds)].map((modifierGroupId) => ({ productId, modifierGroupId })) });
    }
    await tx.comboItem.deleteMany({ where: { comboId: productId } });
    if (input.isCombo) {
      await tx.comboItem.createMany({ data: input.comboItems.map((c) => ({ restaurantId: ctx.restaurantId, comboId: productId, productId: c.productId, quantity: c.quantity })) });
    }
    return productId;
  });
}

export async function toggleProductFlag(ctx: ServiceContext, id: string, field: "isActive" | "isAvailable" | "isFeatured" | "isBestseller", value: boolean) {
  assertPermission(ctx, "menu.edit");
  const p = await ctx.db.product.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw new NotFoundError("Menu item");
  await ctx.db.product.update({ where: { id }, data: { [field]: value } });
  if (field === "isAvailable") {
    await audit(ctx, { action: "menu.availability", entity: "Product", entityId: id, summary: `${ctx.actor.name} marked ${p.name} as ${value ? "available" : "sold out"}` });
  }
}

export async function deleteProduct(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "menu.delete");
  const p = await ctx.db.product.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw new NotFoundError("Menu item");
  const combos = await ctx.db.comboItem.findMany({ where: { productId: id }, include: { combo: { select: { name: true, deletedAt: true } } } });
  const live = combos.filter((c) => !c.combo.deletedAt);
  if (live.length) throw new BusinessRuleError(`${p.name} is part of ${live.map((c) => c.combo.name).join(", ")}. Remove it from the combo first.`);
  // Soft delete keeps order history intact.
  await ctx.db.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, sku: `${p.sku}-DEL-${Date.now().toString(36)}`.slice(0, 40) } });
  await audit(ctx, { action: "product.deleted", entity: "Product", entityId: id, summary: `${ctx.actor.name} removed ${p.name} from the menu` });
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listCategories(ctx: ServiceContext) {
  const rows = await ctx.db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, description: c.description, color: c.color, sortOrder: c.sortOrder, isActive: c.isActive, products: c._count.products }));
}

export async function saveCategory(ctx: ServiceContext, input: { id?: string; name: string; description: string | null; color: string | null; sortOrder: number; isActive: boolean }) {
  assertPermission(ctx, input.id ? "menu.edit" : "menu.create");
  const data = { name: input.name, description: input.description, color: input.color, sortOrder: input.sortOrder, isActive: input.isActive };
  if (input.id) {
    await ctx.db.category.update({ where: { id: input.id }, data });
    return input.id;
  }
  return (await ctx.db.category.create({ data: { ...data, restaurantId: ctx.restaurantId } })).id;
}

export async function deleteCategory(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "menu.delete");
  const c = await ctx.db.category.findUnique({ where: { id }, include: { _count: { select: { products: { where: { deletedAt: null } } } } } });
  if (!c) throw new NotFoundError("Category");
  if (c._count.products) throw new BusinessRuleError(`Move the ${c._count.products} items in ${c.name} to another category first`);
  const removed = await ctx.db.product.count({ where: { categoryId: id } });
  if (removed) await ctx.db.category.update({ where: { id }, data: { isActive: false } });
  else await ctx.db.category.delete({ where: { id } });
}

// ─── Modifier groups ────────────────────────────────────────────────────────

export async function listModifierGroups(ctx: ServiceContext) {
  const rows = await ctx.db.modifierGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { modifiers: { orderBy: { sortOrder: "asc" } }, _count: { select: { products: true } } },
  });
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    products: g._count.products,
    modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price, isActive: m.isActive })),
  }));
}

export async function saveModifierGroup(
  ctx: ServiceContext,
  input: { id?: string; name: string; minSelect: number; maxSelect: number; modifiers: { id?: string; name: string; price: number; isActive: boolean }[] },
) {
  assertPermission(ctx, input.id ? "menu.edit" : "menu.create");
  return ctx.db.$transaction(async (tx) => {
    let groupId = input.id;
    if (groupId) {
      const g = await tx.modifierGroup.findUnique({ where: { id: groupId } });
      if (!g) throw new NotFoundError("Modifier group");
      await tx.modifierGroup.update({ where: { id: groupId }, data: { name: input.name, minSelect: input.minSelect, maxSelect: input.maxSelect } });
      const keep = input.modifiers.filter((m) => m.id).map((m) => m.id!);
      // Removed options are deactivated (past orders keep their snapshot).
      await tx.modifier.updateMany({ where: { groupId, id: { notIn: keep } }, data: { isActive: false } });
    } else {
      groupId = (await tx.modifierGroup.create({ data: { restaurantId: ctx.restaurantId, name: input.name, minSelect: input.minSelect, maxSelect: input.maxSelect, sortOrder: await tx.modifierGroup.count() } })).id;
    }
    for (const [i, m] of input.modifiers.entries()) {
      if (m.id) await tx.modifier.update({ where: { id: m.id }, data: { name: m.name, price: m.price, isActive: m.isActive, sortOrder: i } });
      else await tx.modifier.create({ data: { restaurantId: ctx.restaurantId, groupId: groupId!, name: m.name, price: m.price, isActive: m.isActive, sortOrder: i } });
    }
    return groupId!;
  });
}

export async function deleteModifierGroup(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "menu.delete");
  const g = await ctx.db.modifierGroup.findUnique({ where: { id } });
  if (!g) throw new NotFoundError("Modifier group");
  await prisma.productModifierGroup.deleteMany({ where: { modifierGroupId: id } });
  await ctx.db.modifierGroup.delete({ where: { id } });
}

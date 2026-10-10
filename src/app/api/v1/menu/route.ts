import { tenantRoute } from "@/server/api/handler";

/**
 * Public menu for a future customer website / app (API key with menu:read).
 * Only active, non-deleted items; availability included for "sold out" badges.
 */
export const GET = tenantRoute({ permission: "menu.view" }, async (_req, ctx) => {
  const categories = await ctx.db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      products: {
        where: { deletedAt: null, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, sku: true, name: true, description: true, price: true, imageUrl: true, foodType: true, isAvailable: true, isBestseller: true, isSpicy: true, isCombo: true, preparationTime: true,
          variants: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, price: true, isDefault: true } },
          modifierGroups: { select: { modifierGroup: { select: { id: true, name: true, minSelect: true, maxSelect: true, modifiers: { where: { isActive: true }, select: { id: true, name: true, price: true } } } } } },
        },
      },
    },
  });
  return {
    restaurant: { id: ctx.restaurantId, name: ctx.restaurant.name, currency: ctx.restaurant.currency },
    categories: categories.map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, modifierGroups: p.modifierGroups.map((g) => g.modifierGroup) })) })),
  };
});

/**
 * Non-destructive: re-applies demo menu metadata (names, descriptions, photos,
 * recipes) from prisma/seed/menus.ts onto an already-seeded database, matching
 * products by SKU. Useful after editing seed menu data without reseeding.
 *
 *   npx tsx scripts/sync-demo-menu.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { BREW_MENU, COASTAL_MENU, SPICE_MENU, type MenuItemSeed } from "../prisma/seed/menus";

const RENAMED: Record<string, string> = { "ST-SAM": "ST-HBK", "ST-MOM": "ST-CHP" };

async function sync(restaurantName: string, menu: MenuItemSeed[]) {
  const restaurant = await prisma.restaurant.findFirst({ where: { name: restaurantName } });
  if (!restaurant) return;
  let updated = 0;
  for (const item of menu) {
    const product = await prisma.product.findFirst({
      where: { restaurantId: restaurant.id, sku: { in: [item.sku, RENAMED[item.sku] ?? item.sku] } },
    });
    if (!product) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        sku: item.sku,
        name: item.name,
        description: item.description ?? null,
        imageUrl: item.image ?? null,
        price: item.price * 100,
        isSpicy: item.spicy ?? false,
        preparationTime: item.prep ?? null,
      },
    });
    if (item.recipe?.length) {
      const recipe = await prisma.recipe.findUnique({ where: { productId: product.id } });
      const ingredients = await prisma.ingredient.findMany({ where: { restaurantId: restaurant.id, sku: { in: item.recipe.map(([sku]) => sku) } } });
      const bySku = new Map(ingredients.map((i) => [i.sku, i.id]));
      if (recipe && ingredients.length) {
        await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
        await prisma.recipeIngredient.createMany({
          data: item.recipe
            .filter(([sku]) => bySku.has(sku))
            .map(([sku, quantity, unit]) => ({ restaurantId: restaurant.id, recipeId: recipe.id, ingredientId: bySku.get(sku)!, quantity, unit })),
        });
      }
    }
    updated++;
  }
  console.log(`${restaurantName}: ${updated} products synced`);
}

async function main() {
  await sync("Spice & Stone", SPICE_MENU);
  await sync("The Brew Room", BREW_MENU);
  await sync("Coastal Curry Co.", COASTAL_MENU);
}

main().finally(() => prisma.$disconnect());

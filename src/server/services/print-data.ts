import { prisma } from "../db";
import type { ServiceContext } from "../auth/load-context";
import { NotFoundError } from "../errors";

/** Everything a receipt or kitchen ticket needs, tenant-scoped. */
export async function getPrintData(ctx: ServiceContext, orderId: string) {
  const [order, restaurant, settings] = await Promise.all([
    ctx.db.order.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
        discounts: true,
        taxes: true,
        table: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    // The tenant root itself — always the caller's own restaurant.
    prisma.restaurant.findUnique({ where: { id: ctx.restaurantId } }),
    ctx.db.restaurantSettings.findUnique({ where: { restaurantId: ctx.restaurantId } }),
  ]);
  if (!order || !restaurant || !settings) throw new NotFoundError("Order");
  return {
    order: {
      ...order,
      items: order.items.map((i) => ({ ...i, modifiers: (i.modifiers as { name: string; price: number }[] | null) ?? [] })),
    },
    restaurant,
    settings,
  };
}

export type PrintData = Awaited<ReturnType<typeof getPrintData>>;

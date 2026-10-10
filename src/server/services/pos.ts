import type { ServiceContext } from "../auth/load-context";
import { NotFoundError } from "../errors";
import { getProgram } from "./loyalty";
import { OPEN_ORDER_STATUSES } from "./table-state";

/** Everything the POS screen needs in one round trip. */
export async function getPosBootstrap(ctx: ServiceContext) {
  const [categories, products, floors, settings, defaultTax, program, openOrders] = await Promise.all([
    ctx.db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
    ctx.db.product.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, sku: true, description: true, price: true, imageUrl: true, foodType: true, categoryId: true,
        isAvailable: true, isBestseller: true, isFeatured: true, isSpicy: true, isCombo: true, preparationTime: true, barcode: true,
        taxRate: { select: { rate: true, isActive: true, name: true } },
        variants: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, price: true, isDefault: true } },
        modifierGroups: {
          select: {
            modifierGroup: {
              select: {
                id: true, name: true, minSelect: true, maxSelect: true,
                modifiers: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, price: true } },
              },
            },
          },
        },
        comboItems: { select: { quantity: true, product: { select: { name: true } } } },
      },
    }),
    ctx.db.floor.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        tables: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true, name: true, capacity: true, status: true, occupiedSince: true, mergedIntoId: true,
            orders: {
              where: { status: { in: [...OPEN_ORDER_STATUSES] } },
              select: { id: true, orderNumber: true, total: true, status: true },
              take: 1,
            },
          },
        },
      },
    }),
    ctx.db.restaurantSettings.findUniqueOrThrow({ where: { restaurantId: ctx.restaurantId } }),
    ctx.db.taxRate.findFirst({ where: { isDefault: true, isActive: true }, select: { rate: true, name: true } }),
    getProgram(ctx.db, ctx),
    ctx.db.order.findMany({
      where: { status: { in: [...OPEN_ORDER_STATUSES] }, paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, orderNumber: true, status: true, type: true, total: true, paidTotal: true, createdAt: true, customerName: true,
        table: { select: { name: true } }, _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    categories,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      foodType: p.foodType,
      categoryId: p.categoryId,
      isAvailable: p.isAvailable,
      isBestseller: p.isBestseller,
      isFeatured: p.isFeatured,
      isSpicy: p.isSpicy,
      isCombo: p.isCombo,
      preparationTime: p.preparationTime,
      barcode: p.barcode,
      taxRate: p.taxRate?.isActive ? p.taxRate.rate : (defaultTax?.rate ?? 0),
      variants: p.variants,
      modifierGroups: p.modifierGroups.map((g) => g.modifierGroup).filter((g) => g.modifiers.length > 0),
      comboSummary: p.comboItems.map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ""}${c.product.name}`).join(", ") || null,
    })),
    floors: floors.map((f) => ({
      id: f.id,
      name: f.name,
      tables: f.tables.map((t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        status: t.status,
        occupiedSince: t.occupiedSince?.toISOString() ?? null,
        mergedIntoId: t.mergedIntoId,
        openOrder: t.orders[0] ?? null,
      })),
    })),
    settings: {
      taxInclusive: settings.taxInclusive,
      serviceChargePercent: settings.serviceChargePercent,
      roundOffTotals: settings.roundOffTotals,
      defaultOrderType: settings.defaultOrderType,
      requireCustomerForDelivery: settings.requireCustomerForDelivery,
      acceptCash: settings.acceptCash,
      acceptCard: settings.acceptCard,
      acceptUpi: settings.acceptUpi,
      upiId: settings.upiId,
      autoPrintKot: settings.autoPrintKot,
      autoPrintReceipt: settings.autoPrintReceipt,
      taxName: defaultTax?.name ?? "GST",
    },
    loyalty: {
      isEnabled: program.isEnabled,
      pointValue: program.pointValue,
      minRedeemPoints: program.minRedeemPoints,
      maxRedeemPercent: program.maxRedeemPercent,
      pointsPerHundred: program.pointsPerHundred,
    },
    openOrders: openOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      type: o.type,
      total: o.total,
      paidTotal: o.paidTotal,
      createdAt: o.createdAt.toISOString(),
      customerName: o.customerName,
      tableName: o.table?.name ?? null,
      items: o._count.items,
    })),
  };
}

export type PosBootstrap = Awaited<ReturnType<typeof getPosBootstrap>>;

/** Load an open order into POS cart shape for editing or payment. */
export async function getOrderForPos(ctx: ServiceContext, orderId: string) {
  const order = await ctx.db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      discounts: true,
      customer: { select: { id: true, name: true, phone: true, loyalty: { select: { balance: true } } } },
    },
  });
  if (!order) throw new NotFoundError("Order");
  const manual = order.discounts.find((d) => d.source === "MANUAL");
  const coupon = order.discounts.find((d) => d.source === "COUPON");
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    open: (OPEN_ORDER_STATUSES as readonly string[]).includes(order.status),
    type: order.type,
    source: order.source,
    tableId: order.tableId,
    guests: order.guests,
    notes: order.notes,
    deliveryAddress: order.deliveryAddress,
    externalRef: order.externalRef,
    total: order.total,
    paidTotal: order.paidTotal,
    customer: order.customer
      ? { id: order.customer.id, name: order.customer.name, phone: order.customer.phone, loyaltyBalance: order.customer.loyalty?.balance ?? 0 }
      : null,
    discount: manual ? { type: manual.type, value: manual.value, reason: manual.reason } : null,
    couponCode: coupon?.couponCode ?? null,
    redeemPoints: order.loyaltyPointsRedeemed,
    lines: order.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      notes: i.notes,
      modifierIds: ((i.modifiers as { id: string }[] | null) ?? []).map((m) => m.id),
    })),
  };
}

export type PosOrder = Awaited<ReturnType<typeof getOrderForPos>>;

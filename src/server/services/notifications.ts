import type { ServiceContext } from "../auth/load-context";
import { hasPermission } from "../auth/guards-core";

export interface AppNotification {
  id: string;
  kind: "stock" | "kitchen" | "reservation" | "online" | "payment";
  title: string;
  description: string;
  href: string;
  tone: "warning" | "danger" | "info" | "brand";
  at: string;
}

/** Live operational alerts, computed on demand and limited to what the user may see. */
export async function getNotifications(ctx: ServiceContext): Promise<AppNotification[]> {
  const out: AppNotification[] = [];
  const now = new Date();

  if (hasPermission(ctx, "inventory.view")) {
    const ingredients = await ctx.db.ingredient.findMany({
      where: { isActive: true },
      select: { id: true, name: true, currentStock: true, minStock: true, unit: true, expiryDate: true },
    });
    const low = ingredients.filter((i) => i.currentStock <= i.minStock);
    const out0 = low.filter((i) => i.currentStock <= 0);
    if (low.length) {
      out.push({
        id: "stock-low",
        kind: "stock",
        title: `${low.length} ingredient${low.length > 1 ? "s" : ""} below minimum`,
        description: `${low.slice(0, 3).map((i) => i.name).join(", ")}${low.length > 3 ? ` +${low.length - 3} more` : ""}${out0.length ? ` · ${out0.length} out of stock` : ""}`,
        href: "/app/inventory?tab=stock&filter=low",
        tone: out0.length ? "danger" : "warning",
        at: now.toISOString(),
      });
    }
    const soon = ingredients.filter((i) => i.expiryDate && i.expiryDate.getTime() - now.getTime() < 3 * 86_400_000);
    if (soon.length) {
      out.push({
        id: "stock-expiry",
        kind: "stock",
        title: `${soon.length} item${soon.length > 1 ? "s" : ""} expiring within 3 days`,
        description: soon.slice(0, 3).map((i) => i.name).join(", "),
        href: "/app/inventory?tab=stock&filter=expiring",
        tone: "warning",
        at: now.toISOString(),
      });
    }
  }

  if (hasPermission(ctx, "orders.view")) {
    // The kitchen works from the board; everyone else lands on the matching order list.
    const kitchen = !(["pos.create_order", "orders.create", "pos.process_payment"] as const).some((k) => hasPermission(ctx, k));
    const [waiting, ready] = await Promise.all([
      ctx.db.order.count({ where: { status: "NEW" } }),
      ctx.db.order.findMany({ where: { status: "READY" }, select: { id: true, orderNumber: true, readyAt: true }, take: 5 }),
    ]);
    if (waiting) {
      out.push({
        id: "kitchen-new",
        kind: "kitchen",
        title: `${waiting} order${waiting > 1 ? "s" : ""} waiting for the kitchen`,
        description: "Not yet started",
        href: kitchen ? "/app/orders?view=board" : "/app/orders?tab=NEW",
        tone: "info",
        at: now.toISOString(),
      });
    }
    if (ready.length) {
      out.push({
        id: "kitchen-ready",
        kind: "kitchen",
        title: `${ready.length} order${ready.length > 1 ? "s" : ""} ready to serve`,
        description: ready.map((o) => o.orderNumber).join(", "),
        href: kitchen ? "/app/orders?view=board" : "/app/orders?tab=READY",
        tone: "brand",
        at: (ready[0]?.readyAt ?? now).toISOString(),
      });
    }
    const failedImports = await ctx.db.externalOrder.count({ where: { status: { in: ["RECEIVED", "FAILED"] } } });
    if (failedImports) {
      out.push({
        id: "online-pending",
        kind: "online",
        title: `${failedImports} aggregator order${failedImports > 1 ? "s" : ""} need attention`,
        description: "Review in Swiggy & Zomato",
        href: "/app/integrations",
        tone: "danger",
        at: now.toISOString(),
      });
    }
  }

  if (hasPermission(ctx, "reservations.view")) {
    const upcoming = await ctx.db.reservation.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: now, lte: new Date(now.getTime() + 3 * 3_600_000) } },
      orderBy: { startsAt: "asc" },
      take: 4,
    });
    const pending = upcoming.filter((r) => r.status === "PENDING").length;
    if (upcoming.length) {
      out.push({
        id: "reservations-soon",
        kind: "reservation",
        title: `${upcoming.length} reservation${upcoming.length > 1 ? "s" : ""} in the next 3 hours`,
        description: `${upcoming.map((r) => `${r.customerName} (${r.partySize})`).slice(0, 3).join(", ")}${pending ? ` · ${pending} unconfirmed` : ""}`,
        href: "/app/reservations",
        tone: pending ? "warning" : "info",
        at: upcoming[0]!.startsAt.toISOString(),
      });
    }
  }

  if (hasPermission(ctx, "pos.process_payment")) {
    // Food already handed over (or waiting at the pass) with the bill still open.
    const unpaid = await ctx.db.order.count({
      where: {
        paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
        OR: [{ status: "SERVED" }, { status: "READY", type: { not: "DINE_IN" } }],
      },
    });
    if (unpaid) {
      out.push({
        id: "payment-due",
        kind: "payment",
        title: `${unpaid} served order${unpaid > 1 ? "s" : ""} waiting for payment`,
        description: "Settle the bill to close them",
        href: "/app/orders?tab=SERVED",
        tone: "warning",
        at: now.toISOString(),
      });
    }
  }

  return out;
}

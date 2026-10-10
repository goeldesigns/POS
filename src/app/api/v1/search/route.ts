import { tenantRoute } from "@/server/api/handler";
import { hasPermission } from "@/server/auth/guards-core";

/** Global Ctrl+K search — only returns entities the caller can view. */
export const GET = tenantRoute({}, async (req, ctx) => {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (q.length < 2) return { orders: [], customers: [], products: [] };
  const contains = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\D/g, "");

  const [orders, customers, products] = await Promise.all([
    hasPermission(ctx, "orders.view")
      ? ctx.db.order.findMany({
          where: {
            OR: [
              { orderNumber: contains },
              { customerName: contains },
              ...(digits ? [{ number: Number(digits) || -1 }, { customerPhone: { contains: digits } }] : []),
              { table: { name: contains } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, orderNumber: true, total: true, status: true, customerName: true, table: { select: { name: true } }, createdAt: true },
        })
      : [],
    hasPermission(ctx, "customers.view")
      ? ctx.db.customer.findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { email: contains }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] },
          take: 5,
          select: { id: true, name: true, phone: true },
        })
      : [],
    hasPermission(ctx, "menu.view")
      ? ctx.db.product.findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { sku: contains }] },
          take: 5,
          select: { id: true, name: true, price: true, sku: true },
        })
      : [],
  ]);
  return { orders, customers, products };
});

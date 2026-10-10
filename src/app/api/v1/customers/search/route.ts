import { tenantRoute } from "@/server/api/handler";

/** Fast customer lookup for the POS — by phone, name or email. */
export const GET = tenantRoute({ permission: ["customers.view", "pos.create_order"] }, async (req, ctx) => {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  const digits = q.replace(/\D/g, "");
  const customers = await ctx.db.customer.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    orderBy: q ? { name: "asc" } : { lastVisitAt: { sort: "desc", nulls: "last" } },
    take: 8,
    select: { id: true, name: true, phone: true, email: true, totalOrders: true, lastVisitAt: true, loyalty: { select: { balance: true } } },
  });
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    totalOrders: c.totalOrders,
    lastVisitAt: c.lastVisitAt,
    loyaltyBalance: c.loyalty?.balance ?? 0,
  }));
});

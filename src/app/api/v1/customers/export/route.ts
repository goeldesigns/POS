import { csvResponse, toCsv } from "@/lib/csv";
import { tenantRoute } from "@/server/api/handler";
import { customerWhere } from "@/server/services/customers";

export const GET = tenantRoute({ permission: ["customers.view"] }, async (req, ctx) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const rows = await ctx.db.customer.findMany({ where: customerWhere(sp), orderBy: { name: "asc" }, take: 20_000, include: { loyalty: true } });
  const csv = toCsv(
    [
      { key: "name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "birthday", label: "Birthday" },
      { key: "tags", label: "Tags" },
      { key: "orders", label: "Total orders" },
      { key: "spend", label: "Total spend" },
      { key: "points", label: "Loyalty points" },
      { key: "lastVisit", label: "Last visit" },
      { key: "since", label: "Customer since" },
    ],
    rows.map((c) => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
      birthday: c.birthday?.toISOString().slice(0, 10),
      tags: c.tags.join("; "),
      orders: c.totalOrders,
      spend: (c.totalSpend / 100).toFixed(2),
      points: c.loyalty?.balance ?? 0,
      lastVisit: c.lastVisitAt?.toISOString().slice(0, 10),
      since: c.createdAt.toISOString().slice(0, 10),
    })),
  );
  return csvResponse(`customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

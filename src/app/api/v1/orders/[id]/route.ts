import { tenantRoute } from "@/server/api/handler";
import { getOrderDetail } from "@/server/services/orders";

export const GET = tenantRoute<{ id: string }>({ permission: ["orders.view", "pos.view"] }, async (_req, ctx, { id }) => {
  const o = await getOrderDetail(ctx, id);
  return {
    ...o,
    items: o.items.map((i) => ({ ...i, modifiers: (i.modifiers as { id: string; name: string; price: number }[] | null) ?? [] })),
  };
});

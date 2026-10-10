import { tenantRoute } from "@/server/api/handler";
import { listIngredients } from "@/server/services/inventory";

/**
 * GET /api/v1/inventory — ingredient stock levels.
 * Same filters as the Inventory page: ?q=&category=&filter=low|out|expiring&page=&pageSize=
 */
export const GET = tenantRoute({ permission: "inventory.view" }, async (req, ctx) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = await listIngredients(ctx, sp);
  return { rows: result.rows, total: result.total, page: result.params.page, pageSize: result.params.pageSize };
});

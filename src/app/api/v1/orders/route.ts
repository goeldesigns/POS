import { orderDraftSchema, paymentLineSchema } from "@/lib/validation/operations";
import { z } from "zod";
import { readJson, tenantRoute } from "@/server/api/handler";
import { ValidationError } from "@/server/errors";
import { checkout, saveOrder } from "@/server/services/orders";
import { listOrders } from "@/server/services/order-queries";

/**
 * GET  /api/v1/orders            — list (same filters as the Orders page)
 * POST /api/v1/orders            — create an order from any channel
 *
 * The same pipeline serves the POS, a future customer website, mobile apps and
 * aggregator imports. Authenticate with the session cookie or an API key:
 *   Authorization: Bearer tbl_live_…
 *
 * Body: { source, type, customer?, items[], notes?, payment? }
 *   payment present → order is created and paid in one step (online payment)
 */
export const GET = tenantRoute({ permission: "orders.view" }, async (req, ctx) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = await listOrders(ctx, sp, ctx.restaurant.timezone);
  return { rows: result.rows, total: result.total, page: result.params.page, pageSize: result.params.pageSize };
});

const createSchema = orderDraftSchema.omit({ orderId: true }).extend({
  payments: z.array(paymentLineSchema).max(6).optional(),
});

export const POST = tenantRoute({ permission: ["orders.create", "pos.create_order"] }, async (req, ctx) => {
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ValidationError("Invalid order", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  }
  const { payments, ...draft } = parsed.data;
  // API keys can't impersonate the in-store POS.
  const source = ctx.kind === "apiKey" && draft.source === "POS" ? "WEBSITE" : draft.source;
  // Online payments captured by the website are recorded with the API key's
  // authority; staff sessions still need their own payment permission.
  const payer = ctx.kind === "apiKey" ? { ...ctx, permissions: new Set([...ctx.permissions, "pos.process_payment" as const]) } : ctx;
  const order = payments?.length
    ? await checkout(payer, { ...draft, source, payments })
    : await saveOrder(ctx, { ...draft, source }, "KITCHEN");
  return Response.json(
    { data: { id: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, total: order.total } },
    { status: 201 },
  );
});

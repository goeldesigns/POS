import { z } from "zod";
import { stockMovementSchema } from "@/lib/validation/inventory";
import { readJson, tenantRoute } from "@/server/api/handler";
import { ValidationError } from "@/server/errors";
import { recordMovement } from "@/server/services/inventory";

/**
 * POST /api/v1/inventory/movements — stock in, stock count or transfer.
 * Body: { ingredientId, type: ADD|ADJUST|TRANSFER_IN|TRANSFER_OUT, quantity, unitCost?, reason?, counterparty? }
 * The service checks the specific permission for the movement type.
 */
export const POST = tenantRoute(
  { permission: ["inventory.add_stock", "inventory.adjust_stock", "inventory.transfer_stock"] },
  async (req, ctx) => {
    const parsed = stockMovementSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new ValidationError("Invalid stock movement", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }
    const input = parsed.data;
    return recordMovement(ctx, {
      ...input,
      unitCost: input.unitCost != null && input.unitCost !== "" ? Math.round(Number(input.unitCost) * 100) : null,
    });
  },
);

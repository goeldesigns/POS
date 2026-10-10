import type { TableStatus } from "@/generated/prisma/enums";
import type { TenantTx } from "../tenant-db";
import { BusinessRuleError, ConflictError, NotFoundError } from "../errors";

export const OPEN_ORDER_STATUSES = ["DRAFT", "NEW", "PREPARING", "READY", "SERVED"] as const;

export async function findOpenOrderForTable(tx: TenantTx, tableId: string, excludeOrderId?: string) {
  return tx.order.findFirst({
    where: {
      tableId,
      status: { in: [...OPEN_ORDER_STATUSES] },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { id: true, orderNumber: true },
  });
}

/** Validate a table can take a new order and return it. */
export async function claimTableTx(tx: TenantTx, tableId: string, forOrderId?: string) {
  const table = await tx.diningTable.findUnique({ where: { id: tableId } });
  if (!table) throw new NotFoundError("Table");
  if (table.status === "BLOCKED") throw new BusinessRuleError(`${table.name} is blocked`);
  if (table.mergedIntoId) throw new BusinessRuleError(`${table.name} is merged — use the primary table`);
  const open = await findOpenOrderForTable(tx, tableId, forOrderId);
  if (open) throw new ConflictError(`${table.name} already has an open order (${open.orderNumber})`);
  await tx.diningTable.update({
    where: { id: table.id },
    data: { status: "OCCUPIED", occupiedSince: table.occupiedSince ?? new Date() },
  });
  return table;
}

/** Free a table (and any tables merged into it) once it has no open orders. */
export async function releaseTableTx(tx: TenantTx, tableId: string, status: TableStatus = "AVAILABLE", excludeOrderId?: string) {
  const open = await findOpenOrderForTable(tx, tableId, excludeOrderId);
  if (open) return false;
  await tx.diningTable.update({ where: { id: tableId }, data: { status, occupiedSince: null } });
  await tx.diningTable.updateMany({
    where: { mergedIntoId: tableId },
    data: { mergedIntoId: null, status, occupiedSince: null },
  });
  return true;
}

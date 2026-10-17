"use server";

import { z } from "zod";
import { floorSchema, idSchema, mergeTablesSchema, tableIdSchema, tableSchema, tableStatusSchema, transferOrderSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { getOrderDetail, transferOrderTable } from "../services/orders";
import { deleteFloor, deleteTable, mergeTables, reorderTables, saveFloor, saveTable, setTableStatus, splitTable } from "../services/tables";

export const saveFloorAction = restaurantAction({ permission: "tables.edit", schema: floorSchema }, (input, ctx) => saveFloor(ctx, input));
export const deleteFloorAction = restaurantAction({ permission: "tables.delete", schema: idSchema }, (input, ctx) => deleteFloor(ctx, input.id));
export const saveTableAction = restaurantAction({ permission: ["tables.create", "tables.edit"], schema: tableSchema }, (input, ctx) => saveTable(ctx, input));
export const deleteTableAction = restaurantAction({ permission: "tables.delete", schema: idSchema }, (input, ctx) => deleteTable(ctx, input.id));
export const setTableStatusAction = restaurantAction({ permission: "tables.edit", schema: tableStatusSchema }, (input, ctx) => setTableStatus(ctx, input.tableId, input.status));
export const mergeTablesAction = restaurantAction({ permission: "tables.assign_orders", schema: mergeTablesSchema }, (input, ctx) =>
  mergeTables(ctx, input.primaryTableId, input.tableIds),
);
export const splitTableAction = restaurantAction({ permission: "tables.assign_orders", schema: tableIdSchema }, (input, ctx) => splitTable(ctx, input.tableId));
export const transferOrderAction = restaurantAction({ permission: "tables.assign_orders", schema: transferOrderSchema }, async (input, ctx) => {
  await transferOrderTable(ctx, input.orderId, input.tableId);
  const { orderNumber } = await getOrderDetail(ctx, input.orderId);
  return { orderNumber };
});
export const reorderTablesAction = restaurantAction(
  { permission: "tables.edit", schema: z.object({ ids: z.array(z.string()).min(1).max(300) }) },
  (input, ctx) => reorderTables(ctx, input.ids),
);

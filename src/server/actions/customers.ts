"use server";

import { customerImportSchema, customerNoteSchema, customerSchema, idSchema } from "@/lib/validation/operations";
import { loyaltyAdjustSchema } from "@/lib/validation/inventory";
import { restaurantAction } from "../action";
import { addCustomerNote, deleteCustomer, importCustomers, saveCustomer } from "../services/customers";
import { adjustPoints } from "../services/loyalty";

export const saveCustomerAction = restaurantAction({ permission: ["customers.create", "customers.edit"], schema: customerSchema }, async (input, ctx) => ({
  id: await saveCustomer(ctx, input),
}));
export const deleteCustomerAction = restaurantAction({ permission: "customers.delete", schema: idSchema }, (input, ctx) => deleteCustomer(ctx, input.id));
export const addCustomerNoteAction = restaurantAction({ permission: "customers.edit", schema: customerNoteSchema }, (input, ctx) =>
  addCustomerNote(ctx, input.customerId, input.body),
);
export const importCustomersAction = restaurantAction({ permission: "customers.create", schema: customerImportSchema }, (input, ctx) => importCustomers(ctx, input.rows));
export const adjustPointsAction = restaurantAction({ permission: "loyalty.manage", schema: loyaltyAdjustSchema }, async (input, ctx) => {
  const a = await adjustPoints(ctx, input);
  return { balance: a.balance };
});

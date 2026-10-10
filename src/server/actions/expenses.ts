"use server";

import { expenseSchema, idSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { deleteExpense, saveExpense } from "../services/expenses";

export const saveExpenseAction = restaurantAction({ permission: ["expenses.create", "expenses.edit"], schema: expenseSchema }, async (input, ctx) => ({
  id: await saveExpense(ctx, input),
}));
export const deleteExpenseAction = restaurantAction({ permission: "expenses.delete", schema: idSchema }, (input, ctx) => deleteExpense(ctx, input.id));

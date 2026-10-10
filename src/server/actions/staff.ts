"use server";

import { z } from "zod";
import { idSchema } from "@/lib/validation/operations";
import { attendanceSchema, shiftSchema, staffLoginSchema, staffSchema } from "@/lib/validation/team";
import { dateOnlyField } from "@/lib/validation/helpers";
import { restaurantAction } from "../action";
import { deleteShift, deleteStaff, giveLoginAccess, markAllPresent, markAttendance, saveShift, saveStaff } from "../services/staff";

export const saveStaffAction = restaurantAction({ permission: ["staff.create", "staff.edit"], schema: staffSchema }, async (input, ctx) => ({ id: await saveStaff(ctx, input) }));
export const deleteStaffAction = restaurantAction({ permission: "staff.delete", schema: idSchema }, (input, ctx) => deleteStaff(ctx, input.id));
export const markAttendanceAction = restaurantAction({ permission: "staff.edit", schema: attendanceSchema }, (input, ctx) => markAttendance(ctx, input));
export const markAllPresentAction = restaurantAction({ permission: "staff.edit", schema: z.object({ date: dateOnlyField("Date") }) }, async (input, ctx) => ({
  marked: await markAllPresent(ctx, input.date),
}));
export const saveShiftAction = restaurantAction({ permission: "staff.edit", schema: shiftSchema }, (input, ctx) => saveShift(ctx, input));
export const deleteShiftAction = restaurantAction({ permission: "staff.edit", schema: idSchema }, (input, ctx) => deleteShift(ctx, input.id));
export const giveLoginAccessAction = restaurantAction({ permission: "staff.edit", schema: staffLoginSchema }, (input, ctx) => giveLoginAccess(ctx, input));

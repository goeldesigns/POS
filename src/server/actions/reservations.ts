"use server";

import { assignReservationTableSchema, reservationSchema, reservationStatusSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { assignReservationTable, saveReservation, setReservationStatus } from "../services/reservations";

export const saveReservationAction = restaurantAction(
  { permission: ["reservations.create", "reservations.edit"], schema: reservationSchema },
  (input, ctx) => saveReservation(ctx, input),
);

export const setReservationStatusAction = restaurantAction(
  { permission: ["reservations.edit", "reservations.cancel"], schema: reservationStatusSchema },
  (input, ctx) => setReservationStatus(ctx, input.id, input.status),
);

export const assignReservationTableAction = restaurantAction(
  { permission: "reservations.edit", schema: assignReservationTableSchema },
  (input, ctx) => assignReservationTable(ctx, input.id, input.tableId),
);

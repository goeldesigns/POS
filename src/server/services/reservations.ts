import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@/generated/prisma/client";
import type { ReservationStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "../errors";
import { findOpenOrderForTable } from "./table-state";

const ACTIVE: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

export function zonedDateTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, hh!, mm!, 0, 0, tz).getTime());
}

export async function listReservations(ctx: ServiceContext, where: Prisma.ReservationWhereInput, take = 500) {
  return ctx.db.reservation.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take,
    include: { table: { select: { id: true, name: true, capacity: true } }, customer: { select: { id: true, totalOrders: true } } },
  });
}

export type ReservationRow = Awaited<ReturnType<typeof listReservations>>[number];

async function assertTableFree(ctx: ServiceContext, tableId: string, start: Date, minutes: number, partySize: number, excludeId?: string) {
  const table = await ctx.db.diningTable.findUnique({ where: { id: tableId } });
  if (!table) throw new NotFoundError("Table");
  if (table.status === "BLOCKED") throw new BusinessRuleError(`${table.name} is blocked`);
  if (table.capacity < partySize) throw new BusinessRuleError(`${table.name} seats ${table.capacity} — choose a bigger table or merge tables`);
  const end = new Date(start.getTime() + minutes * 60_000);
  const clashes = await ctx.db.reservation.findMany({
    where: {
      tableId,
      status: { in: ACTIVE },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { lt: end, gte: new Date(start.getTime() - 8 * 3_600_000) },
    },
  });
  const clash = clashes.find((r) => r.startsAt.getTime() + r.durationMinutes * 60_000 > start.getTime());
  if (clash) {
    throw new ConflictError(`${table.name} is already booked for ${clash.customerName} around that time`);
  }
  return table;
}

export interface ReservationInput {
  id?: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  date: string;
  time: string;
  partySize: number;
  durationMinutes: number;
  tableId: string | null;
  status: ReservationStatus;
  source: string;
  notes: string | null;
  saveCustomer: boolean;
}

export async function saveReservation(ctx: ServiceContext & { restaurant: { timezone: string } }, input: ReservationInput) {
  assertPermission(ctx, input.id ? "reservations.edit" : "reservations.create");
  const startsAt = zonedDateTime(input.date, input.time, ctx.restaurant.timezone);
  if (!input.id && startsAt.getTime() < Date.now() - 15 * 60_000 && input.status !== "COMPLETED") {
    throw new BusinessRuleError("That time has already passed");
  }
  if (input.tableId) await assertTableFree(ctx, input.tableId, startsAt, input.durationMinutes, input.partySize, input.id);

  let customerId = input.customerId;
  if (customerId) {
    const c = await ctx.db.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new NotFoundError("Customer");
  } else if (input.saveCustomer) {
    const phone = input.customerPhone.replace(/[^\d+]/g, "");
    const existing = await ctx.db.customer.findFirst({ where: { phone } });
    customerId = existing
      ? existing.id
      : (await ctx.db.customer.create({ data: { restaurantId: ctx.restaurantId, name: input.customerName, phone, email: input.customerEmail } })).id;
  }

  const data = {
    customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    startsAt,
    durationMinutes: input.durationMinutes,
    partySize: input.partySize,
    tableId: input.tableId,
    status: input.status,
    source: input.source,
    notes: input.notes,
  };

  if (input.id) {
    const existing = await ctx.db.reservation.findUnique({ where: { id: input.id } });
    if (!existing) throw new NotFoundError("Reservation");
    await ctx.db.reservation.update({ where: { id: input.id }, data });
    await audit(ctx, { action: "reservation.updated", entity: "Reservation", entityId: input.id, summary: `${ctx.actor.name} updated the booking for ${input.customerName}` });
    return input.id;
  }
  const r = await ctx.db.reservation.create({ data: { ...data, restaurantId: ctx.restaurantId, createdById: ctx.actor.userId } });
  await audit(ctx, {
    action: "reservation.created",
    entity: "Reservation",
    entityId: r.id,
    summary: `${ctx.actor.name} booked a table for ${input.partySize} (${input.customerName})`,
  });
  return r.id;
}

export async function setReservationStatus(ctx: ServiceContext, id: string, status: ReservationStatus) {
  assertPermission(ctx, status === "CANCELLED" ? "reservations.cancel" : "reservations.edit");
  const r = await ctx.db.reservation.findUnique({ where: { id }, include: { table: true } });
  if (!r) throw new NotFoundError("Reservation");
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(r.status) && status !== r.status) {
    throw new BusinessRuleError("This reservation is already closed");
  }
  await ctx.db.reservation.update({
    where: { id },
    data: { status, ...(status === "SEATED" ? { seatedAt: new Date() } : {}) },
  });
  if (r.table) {
    if (status === "SEATED") {
      const open = await findOpenOrderForTable(ctx.db, r.table.id);
      if (open) throw new BusinessRuleError(`${r.table.name} is still busy with ${open.orderNumber}`);
      await ctx.db.diningTable.update({ where: { id: r.table.id }, data: { status: "OCCUPIED", occupiedSince: new Date() } });
    } else if ((status === "CANCELLED" || status === "NO_SHOW") && r.table.status === "RESERVED") {
      await ctx.db.diningTable.update({ where: { id: r.table.id }, data: { status: "AVAILABLE" } });
    } else if (status === "CONFIRMED" && r.table.status === "AVAILABLE" && r.startsAt.getTime() - Date.now() < 2 * 3_600_000) {
      await ctx.db.diningTable.update({ where: { id: r.table.id }, data: { status: "RESERVED" } });
    }
  }
  const verb = { PENDING: "reopened", CONFIRMED: "confirmed", SEATED: "checked in", COMPLETED: "completed", CANCELLED: "cancelled", NO_SHOW: "marked as no-show" }[status];
  await audit(ctx, { action: `reservation.${status.toLowerCase()}`, entity: "Reservation", entityId: id, summary: `${ctx.actor.name} ${verb} ${r.customerName}'s booking` });
}

export async function assignReservationTable(ctx: ServiceContext, id: string, tableId: string | null) {
  assertPermission(ctx, "reservations.edit");
  const r = await ctx.db.reservation.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Reservation");
  if (tableId) await assertTableFree(ctx, tableId, r.startsAt, r.durationMinutes, r.partySize, r.id);
  await ctx.db.reservation.update({ where: { id }, data: { tableId } });
}

import type { TableStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { BusinessRuleError, ConflictError, NotFoundError, PlanLimitError } from "../errors";
import { findOpenOrderForTable, OPEN_ORDER_STATUSES } from "./table-state";
import { transferOrderTable } from "./orders";

export async function getFloorPlan(ctx: ServiceContext) {
  const now = new Date();
  const dayEnd = new Date(now.getTime() + 12 * 3_600_000);
  const [floors, reservations] = await Promise.all([
    ctx.db.floor.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        tables: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            mergedTables: { select: { id: true, name: true } },
            mergedInto: { select: { id: true, name: true } },
            orders: {
              where: { status: { in: [...OPEN_ORDER_STATUSES] } },
              select: {
                id: true, orderNumber: true, total: true, paidTotal: true, status: true, guests: true, createdAt: true, placedAt: true,
                _count: { select: { items: true } },
              },
              take: 1,
            },
          },
        },
      },
    }),
    ctx.db.reservation.findMany({
      where: { tableId: { not: null }, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: new Date(now.getTime() - 30 * 60_000), lte: dayEnd } },
      orderBy: { startsAt: "asc" },
      select: { id: true, tableId: true, startsAt: true, customerName: true, partySize: true, status: true },
    }),
  ]);
  const nextRes = new Map<string, (typeof reservations)[number]>();
  for (const r of reservations) if (r.tableId && !nextRes.has(r.tableId)) nextRes.set(r.tableId, r);

  return floors.map((f) => ({
    id: f.id,
    name: f.name,
    tables: f.tables.map((t) => {
      const o = t.orders[0];
      const r = nextRes.get(t.id);
      return {
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        shape: t.shape,
        status: t.status,
        notes: t.notes,
        floorId: t.floorId,
        occupiedSince: t.occupiedSince?.toISOString() ?? null,
        mergedInto: t.mergedInto,
        mergedTables: t.mergedTables,
        openOrder: o
          ? { id: o.id, orderNumber: o.orderNumber, total: o.total, paidTotal: o.paidTotal, status: o.status, guests: o.guests, items: o._count.items, since: (o.placedAt ?? o.createdAt).toISOString() }
          : null,
        reservation: r ? { id: r.id, startsAt: r.startsAt.toISOString(), customerName: r.customerName, partySize: r.partySize, status: r.status } : null,
      };
    }),
  }));
}

export type FloorPlan = Awaited<ReturnType<typeof getFloorPlan>>;
export type FloorTable = FloorPlan[number]["tables"][number];

export async function saveFloor(ctx: ServiceContext, input: { id?: string; name: string }) {
  assertPermission(ctx, "tables.edit");
  if (input.id) {
    await ctx.db.floor.update({ where: { id: input.id }, data: { name: input.name } });
    return input.id;
  }
  const count = await ctx.db.floor.count();
  const floor = await ctx.db.floor.create({ data: { restaurantId: ctx.restaurantId, name: input.name, sortOrder: count } });
  return floor.id;
}

export async function deleteFloor(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "tables.delete");
  const floor = await ctx.db.floor.findUnique({ where: { id }, include: { _count: { select: { tables: true } } } });
  if (!floor) throw new NotFoundError("Section");
  if (floor._count.tables > 0) throw new BusinessRuleError("Move or delete the tables in this section first");
  await ctx.db.floor.delete({ where: { id } });
}

export async function saveTable(
  ctx: ServiceContext,
  input: { id?: string; name: string; floorId: string; capacity: number; shape: "SQUARE" | "ROUND" | "RECTANGLE"; notes: string | null },
) {
  const floor = await ctx.db.floor.findUnique({ where: { id: input.floorId } });
  if (!floor) throw new NotFoundError("Section");
  if (input.id) {
    assertPermission(ctx, "tables.edit");
    await ctx.db.diningTable.update({
      where: { id: input.id },
      data: { name: input.name, floorId: input.floorId, capacity: input.capacity, shape: input.shape, notes: input.notes },
    });
    return input.id;
  }
  assertPermission(ctx, "tables.create");
  const sub = await ctx.db.subscription.findFirst({ include: { plan: true } });
  const count = await ctx.db.diningTable.count();
  if (sub?.plan.maxTables && count >= sub.plan.maxTables) {
    throw new PlanLimitError(`The ${sub.plan.name} plan allows ${sub.plan.maxTables} tables. Upgrade to add more.`);
  }
  const t = await ctx.db.diningTable.create({
    data: {
      restaurantId: ctx.restaurantId,
      name: input.name,
      floorId: input.floorId,
      capacity: input.capacity,
      shape: input.shape,
      notes: input.notes,
      sortOrder: await ctx.db.diningTable.count({ where: { floorId: input.floorId } }),
    },
  });
  await audit(ctx, { action: "table.created", entity: "Table", entityId: t.id, summary: `${ctx.actor.name} added table ${t.name} in ${floor.name}` });
  return t.id;
}

export async function deleteTable(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "tables.delete");
  const table = await ctx.db.diningTable.findUnique({ where: { id } });
  if (!table) throw new NotFoundError("Table");
  const open = await findOpenOrderForTable(ctx.db, id);
  if (open) throw new BusinessRuleError(`${table.name} has an open order (${open.orderNumber})`);
  await ctx.db.diningTable.updateMany({ where: { mergedIntoId: id }, data: { mergedIntoId: null } });
  await ctx.db.diningTable.delete({ where: { id } });
  await audit(ctx, { action: "table.deleted", entity: "Table", entityId: id, summary: `${ctx.actor.name} deleted table ${table.name}` });
}

export async function setTableStatus(ctx: ServiceContext, tableId: string, status: TableStatus) {
  assertPermission(ctx, "tables.edit");
  const table = await ctx.db.diningTable.findUnique({ where: { id: tableId } });
  if (!table) throw new NotFoundError("Table");
  if (status !== "OCCUPIED") {
    const open = await findOpenOrderForTable(ctx.db, tableId);
    if (open) throw new BusinessRuleError(`${table.name} still has an open order (${open.orderNumber}). Settle or move it first.`);
  }
  await ctx.db.diningTable.update({
    where: { id: tableId },
    data: { status, occupiedSince: status === "OCCUPIED" ? (table.occupiedSince ?? new Date()) : null },
  });
}

export async function mergeTables(ctx: ServiceContext, primaryTableId: string, tableIds: string[]) {
  assertPermission(ctx, "tables.assign_orders");
  const ids = tableIds.filter((id) => id !== primaryTableId);
  const primary = await ctx.db.diningTable.findUnique({ where: { id: primaryTableId } });
  if (!primary) throw new NotFoundError("Table");
  if (primary.mergedIntoId) throw new BusinessRuleError(`${primary.name} is already merged into another table`);
  const others = await ctx.db.diningTable.findMany({ where: { id: { in: ids } } });
  if (others.length !== ids.length) throw new NotFoundError("Table");
  const primaryOrder = await findOpenOrderForTable(ctx.db, primary.id);

  // Check every table before moving anything: at most one open order may come along with the merge.
  let carried = primaryOrder ? { table: primary.name } : null;
  const moves: string[] = [];
  for (const t of others) {
    if (t.status === "BLOCKED") throw new BusinessRuleError(`${t.name} is blocked`);
    if (t.mergedIntoId && t.mergedIntoId !== primary.id) throw new BusinessRuleError(`${t.name} is already merged with another table`);
    const open = await findOpenOrderForTable(ctx.db, t.id);
    if (!open) continue;
    if (carried) throw new ConflictError(`${t.name} and ${carried.table} both have open orders — settle or move one first`);
    carried = { table: t.name };
    moves.push(open.id);
  }
  for (const orderId of moves) await transferOrderTable(ctx, orderId, primary.id);
  await ctx.db.diningTable.updateMany({ where: { id: { in: ids } }, data: { mergedIntoId: primary.id, status: "OCCUPIED" } });
  await ctx.db.diningTable.update({ where: { id: primary.id }, data: { status: "OCCUPIED", occupiedSince: primary.occupiedSince ?? new Date() } });
  await audit(ctx, {
    action: "table.merged",
    entity: "Table",
    entityId: primary.id,
    summary: `${ctx.actor.name} merged ${others.map((t) => t.name).join(", ")} into ${primary.name}`,
  });
}

export async function splitTable(ctx: ServiceContext, primaryTableId: string) {
  assertPermission(ctx, "tables.assign_orders");
  const children = await ctx.db.diningTable.findMany({ where: { mergedIntoId: primaryTableId } });
  if (!children.length) throw new BusinessRuleError("This table isn't merged with any other table");
  await ctx.db.diningTable.updateMany({ where: { mergedIntoId: primaryTableId }, data: { mergedIntoId: null, status: "AVAILABLE", occupiedSince: null } });
  await audit(ctx, { action: "table.split", entity: "Table", entityId: primaryTableId, summary: `${ctx.actor.name} split ${children.map((c) => c.name).join(", ")} back out` });
}

export async function reorderTables(ctx: ServiceContext, orderedIds: string[]) {
  assertPermission(ctx, "tables.edit");
  const owned = await ctx.db.diningTable.findMany({ where: { id: { in: orderedIds } }, select: { id: true } });
  if (owned.length !== orderedIds.length) throw new NotFoundError("Table");
  await ctx.db.$transaction(orderedIds.map((id, i) => ctx.db.diningTable.update({ where: { id }, data: { sortOrder: i } })));
}

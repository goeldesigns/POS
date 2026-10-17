import type { OrderStatus, ReservationStatus, TableStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

interface FloorTableWire {
  id: string;
  name: string;
  capacity: number;
  shape: "SQUARE" | "ROUND" | "RECTANGLE";
  status: TableStatus;
  notes: string | null;
  floorId: string;
  occupiedSince: string | null;
  mergedInto: { id: string; name: string } | null;
  mergedTables: { id: string; name: string }[];
  openOrder: { id: string; orderNumber: string; total: number; paidTotal: number; status: OrderStatus; guests: number | null; items: number; since: string } | null;
  reservation: { id: string; startsAt: string; customerName: string; partySize: number; status: ReservationStatus } | null;
}

export async function getFloorPlan(_ctx: ServiceContext) {
  return backend.get<{ id: string; name: string; tables: FloorTableWire[] }[]>("/api/v1/tables");
}

export type FloorPlan = Awaited<ReturnType<typeof getFloorPlan>>;
export type FloorTable = FloorPlan[number]["tables"][number];

export async function saveFloor(_ctx: ServiceContext, input: { id?: string; name: string }) {
  const saved = input.id ? await backend.put<{ id: string }>(`/api/v1/tables/floors/${input.id}`, { name: input.name }) : await backend.post<{ id: string }>("/api/v1/tables/floors", { name: input.name });
  return saved.id;
}

export async function deleteFloor(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/tables/floors/${id}`);
}

export async function saveTable(
  _ctx: ServiceContext,
  input: { id?: string; name: string; floorId: string; capacity: number; shape: "SQUARE" | "ROUND" | "RECTANGLE"; notes: string | null },
) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/tables/${id}`, body) : await backend.post<{ id: string }>("/api/v1/tables", body);
  return saved.id;
}

export async function deleteTable(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/tables/${id}`);
}

export async function setTableStatus(_ctx: ServiceContext, tableId: string, status: TableStatus) {
  await backend.put(`/api/v1/tables/${tableId}/status`, { status });
}

export async function mergeTables(_ctx: ServiceContext, primaryTableId: string, tableIds: string[]) {
  await backend.post("/api/v1/tables/merge", { primaryTableId, tableIds });
}

export async function splitTable(_ctx: ServiceContext, primaryTableId: string) {
  await backend.post(`/api/v1/tables/${primaryTableId}/split`);
}

export async function reorderTables(_ctx: ServiceContext, orderedIds: string[]) {
  await backend.put("/api/v1/tables/order", { ids: orderedIds });
}

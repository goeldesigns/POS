import { TZDate } from "@date-fns/tz";
import type { ReservationStatus } from "@/lib/enums";
import type { ResItem } from "@/components/reservations/reservations-view";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import type { SearchParams } from "../list-params";

export function zonedDateTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, d!, hh!, mm!, 0, 0, tz).getTime());
}

export async function getReservations(_ctx: ServiceContext, view: "calendar" | "list", month: string, sp: SearchParams) {
  return backend.get<{ rows: ResItem[]; tables: { id: string; name: string; capacity: number; floor: string }[]; defaultDurationMinutes: number }>("/api/v1/reservations", {
    view,
    month,
    ...pick(sp, "period", "status", "q"),
  });
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

export async function saveReservation(_ctx: ServiceContext, input: ReservationInput) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/reservations/${id}`, body) : await backend.post<{ id: string }>("/api/v1/reservations", body);
  return saved.id;
}

export async function setReservationStatus(_ctx: ServiceContext, id: string, status: ReservationStatus) {
  await backend.post(`/api/v1/reservations/${id}/status`, { status });
}

export async function assignReservationTable(_ctx: ServiceContext, id: string, tableId: string | null) {
  await backend.put(`/api/v1/reservations/${id}/table`, { tableId });
}

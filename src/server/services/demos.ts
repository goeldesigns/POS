import type { DemoStatus } from "@/generated/prisma/enums";
import type { DemoDay } from "@/lib/demo";
import { backend, pick } from "../backend/client";
import type { PlatformContext } from "../auth/load-context";
import type { RequestMeta } from "../auth/session";
import { parseListParams, param, type SearchParams } from "../list-params";

export async function demoAvailability(_now = new Date()): Promise<DemoDay[]> {
  return backend.get<DemoDay[]>("/api/v1/public/demo/availability");
}

export interface DemoBookingInput {
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  restaurantName: string;
  city: string | null;
  outlets: number;
  restaurantType: string | null;
  currentSystem: string | null;
  message: string | null;
}

export async function createDemoRequest(input: DemoBookingInput, _meta: RequestMeta = {}) {
  return backend.post<{ id: string; scheduledAt: string }>("/api/v1/public/demo-requests", input);
}

export interface DemoRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  restaurantName: string;
  city: string | null;
  outlets: number;
  restaurantType: string | null;
  currentSystem: string | null;
  message: string | null;
  scheduledAt: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: DemoStatus;
  meetingLink: string | null;
  adminNotes: string | null;
  assignedTo: { id: string; name: string } | null;
  restaurant: { id: string; name: string } | null;
  source: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DemoListWire {
  view: string;
  total: number;
  rows: DemoRow[];
  counts: Partial<Record<DemoStatus, number>> & { all: number; upcoming: number };
  stats: { newRequests: number; upcoming: number; thisWeek: number; completed: number; converted: number; all: number };
  admins: { id: string; name: string }[];
}

export async function listDemoRequests(sp: SearchParams) {
  const view = param(sp, "status") ?? "upcoming";
  const params = parseListParams(sp, {
    sortable: ["scheduledAt", "createdAt", "restaurantName"] as const,
    defaultSort: view === "upcoming" ? "scheduledAt" : "createdAt",
    defaultDir: view === "upcoming" ? "asc" : "desc",
  });
  const data = await backend.get<DemoListWire>("/api/v1/admin/demo-requests", pick(sp, "status", "q", "from", "to", "page", "pageSize", "sort", "dir"));
  const { newRequests, ...rest } = data.stats;
  return { view, params, total: data.total, rows: data.rows, counts: data.counts, stats: { new: newRequests, ...rest }, admins: data.admins };
}

export interface DemoUpdateInput extends DemoBookingInput {
  id: string;
  durationMinutes: number;
  status: DemoStatus;
  meetingLink: string | null;
  adminNotes: string | null;
  assignedToId: string | null;
  notifyCustomer: boolean;
}

export async function updateDemoRequest(_ctx: Pick<PlatformContext, "actor" | "meta">, input: DemoUpdateInput) {
  const { id, ...body } = input;
  await backend.put(`/api/v1/admin/demo-requests/${id}`, body);
  return { id, notified: input.notifyCustomer };
}

export async function setDemoStatus(_ctx: Pick<PlatformContext, "actor" | "meta">, id: string, status: DemoStatus) {
  await backend.post(`/api/v1/admin/demo-requests/${id}/status`, { status });
  return { id };
}

export async function deleteDemoRequest(_ctx: Pick<PlatformContext, "actor" | "meta">, id: string) {
  await backend.delete(`/api/v1/admin/demo-requests/${id}`);
}

export async function getDemoForConversion(id: string) {
  const demo = await backend.get<DemoRow>(`/api/v1/admin/demo-requests/${id}`).catch(() => null);
  if (!demo || demo.restaurant) return null;
  return demo;
}

export async function demoInbox(_now = new Date()) {
  return backend.get<{ fresh: number; today: number }>("/api/v1/admin/demo-requests/inbox");
}

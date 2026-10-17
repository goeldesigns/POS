import type { AttendanceStatus } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, type SearchParams } from "../list-params";

/** @db.Date columns: always compare/store at UTC midnight. */
export function toDbDate(d: Date | string): Date {
  const iso = typeof d === "string" ? d : d.toISOString();
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

const dateOnly = (value: Date | string) => (typeof value === "string" ? value : value.toISOString()).slice(0, 10);

interface StaffRowWire {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  roleTitle: string;
  employeeCode: string;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  joiningDate: string;
  salary: number;
  address: string | null;
  emergencyContact: string | null;
  login: { memberId: string; role: string; isOwner: boolean; status: "ACTIVE" | "SUSPENDED"; email: string; lastLoginAt: string | null } | null;
  today: { status: AttendanceStatus; clockIn: string | null } | null;
}

export async function listStaff(_ctx: ServiceContext, sp: SearchParams, _today: Date) {
  const p = parseListParams(sp, { sortable: ["name", "joiningDate", "salary"] as const, defaultSort: "name", defaultDir: "asc", defaultPageSize: 50 });
  const data = await backend.get<{ rows: StaffRowWire[]; total: number; roles: string[] }>("/api/v1/staff", pick(sp, "q", "status", "role", "page", "pageSize", "sort", "dir"));
  return { params: p, total: data.total, roles: data.roles, rows: data.rows };
}

export type StaffRow = Awaited<ReturnType<typeof listStaff>>["rows"][number];

export interface StaffInput {
  id?: string;
  name: string;
  email: string | null;
  phone: string;
  roleTitle: string;
  employeeCode: string;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  joiningDate: Date;
  salary: number;
  address: string | null;
  emergencyContact: string | null;
}

export async function saveStaff(_ctx: ServiceContext, input: StaffInput) {
  const { id, ...rest } = input;
  const body = { ...rest, joiningDate: dateOnly(input.joiningDate) };
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/staff/${id}`, body) : await backend.post<{ id: string }>("/api/v1/staff", body);
  return saved.id;
}

export async function nextEmployeeCode(_ctx: ServiceContext) {
  return (await backend.get<{ code: string }>("/api/v1/staff/next-code")).code;
}

export async function deleteStaff(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/staff/${id}`);
}

export async function markAttendance(
  _ctx: ServiceContext & { restaurant: { timezone: string } },
  input: { staffId: string; date: Date; status: AttendanceStatus; clockIn?: string | null; clockOut?: string | null; notes: string | null },
) {
  await backend.put("/api/v1/staff/attendance", { ...input, date: dateOnly(input.date) });
}

export async function markAllPresent(_ctx: ServiceContext, day: Date) {
  return (await backend.post<{ marked: number }>("/api/v1/staff/attendance/mark-all-present", { date: dateOnly(day) })).marked;
}

export async function saveShift(_ctx: ServiceContext, input: { id?: string; staffId: string; date: Date; startTime: string; endTime: string; station: string | null; notes: string | null }) {
  const { id, ...rest } = input;
  const body = { ...rest, date: dateOnly(input.date) };
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/staff/shifts/${id}`, body) : await backend.post<{ id: string }>("/api/v1/staff/shifts", body);
  return saved.id;
}

export async function deleteShift(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/staff/shifts/${id}`);
}

export async function giveLoginAccess(_ctx: ServiceContext, input: { staffId: string; email: string; password: string; roleId: string }) {
  const { staffId, ...body } = input;
  const result = await backend.post<{ memberId: string }>(`/api/v1/staff/${staffId}/login`, body);
  return result.memberId;
}

export async function getAttendanceRegister(_ctx: ServiceContext, date: string) {
  return backend.get<{ date: string; rows: { staffId: string; name: string; roleTitle: string; status: AttendanceStatus | null; clockIn: string | null; clockOut: string | null }[] }>(
    "/api/v1/staff/attendance",
    { date },
  );
}

export async function getShiftPlan(_ctx: ServiceContext, week: string) {
  return backend.get<{
    weekStart: string;
    staff: { id: string; name: string; roleTitle: string }[];
    stations: string[];
    shifts: { id: string; staffId: string; date: string; startTime: string; endTime: string; station: string | null }[];
  }>("/api/v1/staff/shifts", { week });
}

export async function staffPerformance(_ctx: ServiceContext, period: "7d" | "30d" | "90d") {
  const rows = await backend.get<
    { id: string; name: string; roleTitle: string; orders: number; sales: number; averageOrder: number; discounts: number; cancelled: number; refunds: number }[]
  >("/api/v1/staff/performance", { period });
  return rows.map(({ averageOrder, ...r }) => ({ ...r, aov: averageOrder }));
}

interface ActivityEntryWire {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
  ipAddress: string | null;
}

export async function staffActivity(_ctx: ServiceContext, opts: { userId?: string | null }) {
  const data = await backend.get<{ members: { userId: string; name: string }[]; entries: ActivityEntryWire[] }>("/api/v1/staff/activity", { user: opts.userId });
  return { members: data.members, entries: data.entries.map((e) => ({ ...e, createdAt: new Date(e.createdAt) })) };
}

interface StaffProfileWire extends Omit<StaffRowWire, "today"> {
  attendance: { date: string; status: AttendanceStatus }[];
  daysPresent: number;
  upcomingShifts: { id: string; date: string; startTime: string; endTime: string; station: string | null }[];
  activity: ActivityEntryWire[];
}

export async function getStaffProfile(_ctx: ServiceContext, id: string) {
  const s = await backend.get<StaffProfileWire>(`/api/v1/staff/${id}`);
  return {
    ...s,
    joiningDate: new Date(s.joiningDate),
    login: s.login ? { ...s.login, lastLoginAt: s.login.lastLoginAt ? new Date(s.login.lastLoginAt) : null } : null,
    shifts: s.upcomingShifts.map((sh) => ({ ...sh, date: new Date(`${sh.date}T00:00:00.000Z`) })),
    activity: s.activity.map((a) => ({ ...a, createdAt: new Date(a.createdAt) })),
  };
}

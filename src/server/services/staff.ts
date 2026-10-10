import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { parseListParams, param, type SearchParams } from "../list-params";
import { zonedDateTime } from "./reservations";
import { actorIsUnrestricted, createMember } from "./members";

/** @db.Date columns: always compare/store at UTC midnight. */
export function toDbDate(d: Date | string): Date {
  const iso = typeof d === "string" ? d : d.toISOString();
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export async function listStaff(ctx: ServiceContext, sp: SearchParams, today: Date) {
  const p = parseListParams(sp, { sortable: ["name", "joiningDate", "salary"] as const, defaultSort: "name", defaultDir: "asc", defaultPageSize: 50 });
  const and: Prisma.StaffMemberWhereInput[] = [];
  if (p.q) and.push({ OR: [{ name: { contains: p.q, mode: "insensitive" } }, { employeeCode: { contains: p.q, mode: "insensitive" } }, { phone: { contains: p.q } }] });
  const status = param(sp, "status");
  if (status) and.push({ status: status as never });
  const role = param(sp, "role");
  if (role) and.push({ roleTitle: role });
  const where = and.length ? { AND: and } : {};
  const [rows, total, roles] = await Promise.all([
    ctx.db.staffMember.findMany({
      where,
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
      include: {
        restaurantUser: { select: { id: true, status: true, role: { select: { name: true, isOwner: true } }, user: { select: { email: true, lastLoginAt: true } } } },
        attendance: { where: { date: today }, select: { status: true, clockIn: true } },
      },
    }),
    ctx.db.staffMember.count({ where }),
    ctx.db.staffMember.findMany({ distinct: ["roleTitle"], select: { roleTitle: true } }),
  ]);
  return {
    params: p,
    total,
    roles: roles.map((r) => r.roleTitle).sort(),
    rows: rows.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      roleTitle: s.roleTitle,
      employeeCode: s.employeeCode,
      status: s.status,
      joiningDate: s.joiningDate.toISOString(),
      salary: s.salary,
      address: s.address,
      emergencyContact: s.emergencyContact,
      login: s.restaurantUser ? { memberId: s.restaurantUser.id, role: s.restaurantUser.role.name, isOwner: s.restaurantUser.role.isOwner, status: s.restaurantUser.status, email: s.restaurantUser.user.email, lastLoginAt: s.restaurantUser.user.lastLoginAt?.toISOString() ?? null } : null,
      today: s.attendance[0] ? { status: s.attendance[0].status, clockIn: s.attendance[0].clockIn?.toISOString() ?? null } : null,
    })),
  };
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

export async function saveStaff(ctx: ServiceContext, input: StaffInput) {
  assertPermission(ctx, input.id ? "staff.edit" : "staff.create");
  const clash = await ctx.db.staffMember.findFirst({ where: { employeeCode: input.employeeCode, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new ConflictError(`Employee ID ${input.employeeCode} is already used by ${clash.name}`);
  const { id, ...data } = input;
  // Managers can run the team, but the owner's record (salary, title) and the Owner title stay with owners.
  const owner = actorIsUnrestricted(ctx);
  if (id) {
    const existing = await ctx.db.staffMember.findUnique({ where: { id }, include: { restaurantUser: { include: { role: true } } } });
    if (!existing) throw new NotFoundError("Staff member");
    if (!owner && existing.restaurantUser?.role.isOwner) throw new ForbiddenError("Only an owner can edit the owner's staff record");
    if (!owner && input.roleTitle === "Owner" && existing.roleTitle !== "Owner") throw new ForbiddenError("Only an owner can give someone the Owner title");
    await ctx.db.staffMember.update({ where: { id }, data });
    await audit(ctx, { action: "staff.updated", entity: "Staff", entityId: id, summary: `${ctx.actor.name} updated ${input.name}'s staff record` });
    return id;
  }
  if (!owner && input.roleTitle === "Owner") throw new ForbiddenError("Only an owner can give someone the Owner title");
  const s = await ctx.db.staffMember.create({ data: { ...data, restaurantId: ctx.restaurantId } });
  await audit(ctx, { action: "staff.created", entity: "Staff", entityId: s.id, summary: `${ctx.actor.name} added ${input.name} (${input.roleTitle}) to the team` });
  return s.id;
}

export async function nextEmployeeCode(ctx: ServiceContext) {
  const codes = await ctx.db.staffMember.findMany({ select: { employeeCode: true } });
  const max = codes.reduce((m, c) => Math.max(m, Number(c.employeeCode.replace(/\D/g, "")) || 0), 0);
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

export async function deleteStaff(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "staff.delete");
  const s = await ctx.db.staffMember.findUnique({ where: { id }, include: { restaurantUser: { include: { role: true } } } });
  if (!s) throw new NotFoundError("Staff member");
  if (s.restaurantUser?.role.isOwner) throw new BusinessRuleError("The owner's staff record can't be deleted");
  if (s.restaurantUser) throw new BusinessRuleError(`${s.name} still has a login. Remove their access in Settings → Users first.`);
  await ctx.db.staffMember.delete({ where: { id } });
  await audit(ctx, { action: "staff.deleted", entity: "Staff", entityId: id, summary: `${ctx.actor.name} removed ${s.name} from the team` });
}

export async function markAttendance(
  ctx: ServiceContext & { restaurant: { timezone: string } },
  input: { staffId: string; date: Date; status: AttendanceStatus; clockIn?: string | null; clockOut?: string | null; notes: string | null },
) {
  assertPermission(ctx, "staff.edit");
  const staff = await ctx.db.staffMember.findUnique({ where: { id: input.staffId } });
  if (!staff) throw new NotFoundError("Staff member");
  const day = input.date.toISOString().slice(0, 10);
  const date = toDbDate(day);
  const time = (t: string | null | undefined) => (t ? zonedDateTime(day, t, ctx.restaurant.timezone) : null);
  const working = input.status === "PRESENT" || input.status === "LATE" || input.status === "HALF_DAY";
  const data = {
    status: input.status,
    clockIn: working ? time(input.clockIn) : null,
    clockOut: working ? time(input.clockOut) : null,
    notes: input.notes,
  };
  await ctx.db.attendance.upsert({
    where: { staffId_date: { staffId: input.staffId, date } },
    create: { ...data, restaurantId: ctx.restaurantId, staffId: input.staffId, date },
    update: data,
  });
}

export async function markAllPresent(ctx: ServiceContext, day: Date) {
  assertPermission(ctx, "staff.edit");
  const date = toDbDate(day);
  const staff = await ctx.db.staffMember.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const existing = await ctx.db.attendance.findMany({ where: { date }, select: { staffId: true } });
  const done = new Set(existing.map((e) => e.staffId));
  const missing = staff.filter((s) => !done.has(s.id));
  if (missing.length) {
    await ctx.db.attendance.createMany({ data: missing.map((s) => ({ restaurantId: ctx.restaurantId, staffId: s.id, date, status: "PRESENT" as const })) });
  }
  return missing.length;
}

export async function saveShift(ctx: ServiceContext, input: { id?: string; staffId: string; date: Date; startTime: string; endTime: string; station: string | null; notes: string | null }) {
  assertPermission(ctx, "staff.edit");
  const staff = await ctx.db.staffMember.findUnique({ where: { id: input.staffId } });
  if (!staff) throw new NotFoundError("Staff member");
  const { id, ...rest } = input;
  const data = { ...rest, date: toDbDate(rest.date) };
  if (id) {
    await ctx.db.shift.update({ where: { id }, data });
    return id;
  }
  return (await ctx.db.shift.create({ data: { ...data, restaurantId: ctx.restaurantId } })).id;
}

export async function deleteShift(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "staff.edit");
  const s = await ctx.db.shift.findUnique({ where: { id } });
  if (!s) throw new NotFoundError("Shift");
  await ctx.db.shift.delete({ where: { id } });
}

export async function giveLoginAccess(ctx: ServiceContext, input: { staffId: string; email: string; password: string; roleId: string }) {
  assertPermission(ctx, "staff.edit");
  const staff = await ctx.db.staffMember.findUnique({ where: { id: input.staffId } });
  if (!staff) throw new NotFoundError("Staff member");
  if (staff.restaurantUserId) throw new BusinessRuleError(`${staff.name} already has a login`);
  const { member } = await createMember(ctx, { name: staff.name, email: input.email, phone: staff.phone, password: input.password, roleId: input.roleId });
  await ctx.db.staffMember.update({ where: { id: staff.id }, data: { restaurantUserId: member.id, email: staff.email ?? input.email } });
  return member.id;
}

export async function staffPerformance(ctx: ServiceContext, start: Date, end: Date) {
  const [orders, staff] = await Promise.all([
    ctx.db.order.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: "DRAFT" }, createdById: { not: null } },
      select: { createdById: true, status: true, total: true, discountTotal: true, refundedTotal: true, placedAt: true, readyAt: true },
    }),
    ctx.db.staffMember.findMany({ where: { restaurantUserId: { not: null } }, include: { restaurantUser: { select: { userId: true } } } }),
  ]);
  return staff
    .map((s) => {
      const mine = orders.filter((o) => o.createdById === s.restaurantUser!.userId);
      const done = mine.filter((o) => o.status === "COMPLETED");
      const sales = done.reduce((a, o) => a + o.total, 0);
      return {
        id: s.id,
        name: s.name,
        roleTitle: s.roleTitle,
        orders: mine.filter((o) => o.status !== "CANCELLED").length,
        sales,
        aov: done.length ? Math.round(sales / done.length) : 0,
        discounts: mine.reduce((a, o) => a + o.discountTotal, 0),
        cancelled: mine.filter((o) => o.status === "CANCELLED").length,
        refunds: mine.reduce((a, o) => a + o.refundedTotal, 0),
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export async function staffActivity(ctx: ServiceContext, opts: { userId?: string | null; take?: number }) {
  return ctx.db.auditLog.findMany({
    where: { ...(opts.userId ? { userId: opts.userId } : {}), scope: "RESTAURANT" },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    select: { id: true, action: true, summary: true, actorName: true, actorRole: true, createdAt: true, ipAddress: true },
  });
}

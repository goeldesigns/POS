import type { Prisma } from "@/generated/prisma/client";
import type { DemoStatus } from "@/generated/prisma/enums";
import {
  DEMO,
  DEMO_OPEN_STATUSES,
  addDaysToDate,
  demoInstant,
  demoParts,
  demoSlotTimes,
  formatDemoDate,
  formatSlot,
  isDemoSlotTime,
  weekdayOf,
  type DemoDay,
} from "@/lib/demo";
import { BRAND } from "@/config/brand";
import { auditPlatform } from "../audit";
import type { PlatformContext } from "../auth/load-context";
import type { RequestMeta } from "../auth/session";
import { prisma } from "../db";
import { BusinessRuleError, ConflictError, NotFoundError } from "../errors";
import { param, parseListParams, type SearchParams } from "../list-params";
import { mailer } from "../mailer";

const OPEN = DEMO_OPEN_STATUSES as DemoStatus[];

// ─── Availability ───────────────────────────────────────────────────────────

/** Bookable days and slot capacity for the public scheduler. */
export async function demoAvailability(now = new Date()): Promise<DemoDay[]> {
  const today = demoParts(now).date;
  const first = demoInstant(today, "00:00");
  const last = demoInstant(addDaysToDate(today, DEMO.daysAhead + 1), "00:00");
  const booked = await prisma.demoRequest.groupBy({
    by: ["scheduledAt"],
    where: { status: { in: OPEN }, scheduledAt: { gte: first, lt: last } },
    _count: { _all: true },
  });
  const taken = new Map(booked.map((b) => [b.scheduledAt.getTime(), b._count._all]));
  const earliest = now.getTime() + DEMO.leadMinutes * 60_000;

  const days: DemoDay[] = [];
  for (let i = 0; i <= DEMO.daysAhead; i++) {
    const date = addDaysToDate(today, i);
    if (DEMO.closedWeekdays.includes(weekdayOf(date))) {
      days.push({ date, slots: [] });
      continue;
    }
    const slots = demoSlotTimes()
      .map((time) => {
        const at = demoInstant(date, time).getTime();
        return { time, at, remaining: Math.max(0, DEMO.capacityPerSlot - (taken.get(at) ?? 0)) };
      })
      .filter((s) => s.at >= earliest)
      .map(({ time, remaining }) => ({ time, remaining }));
    days.push({ date, slots });
  }
  return days;
}

function assertBookable(date: string, time: string, now = new Date()) {
  if (!isDemoSlotTime(time)) throw new BusinessRuleError("Choose one of the listed times");
  if (DEMO.closedWeekdays.includes(weekdayOf(date))) throw new BusinessRuleError("We don't run demos on that day — please pick another");
  const at = demoInstant(date, time);
  if (at.getTime() < now.getTime() + DEMO.leadMinutes * 60_000) {
    throw new BusinessRuleError("That time is too soon — please pick a later slot");
  }
  const lastDay = addDaysToDate(demoParts(now).date, DEMO.daysAhead);
  if (date > lastDay) throw new BusinessRuleError(`Demos can be booked up to ${DEMO.daysAhead} days ahead`);
  return at;
}

const whenLabel = (at: Date) => {
  const { date, time } = demoParts(at);
  return `${formatDemoDate(date, { year: true })} at ${formatSlot(time)} ${DEMO.timezoneLabel}`;
};

// ─── Public booking ─────────────────────────────────────────────────────────

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

export async function createDemoRequest(input: DemoBookingInput, meta: RequestMeta = {}) {
  const scheduledAt = assertBookable(input.date, input.time);

  const existing = await prisma.demoRequest.findFirst({
    where: { email: input.email, status: { in: OPEN }, scheduledAt: { gte: new Date() } },
    orderBy: { scheduledAt: "asc" },
  });
  if (existing) {
    throw new ConflictError(
      `You already have a demo booked for ${whenLabel(existing.scheduledAt)}. Reply to the confirmation email if you need to change it.`,
    );
  }

  const demo = await prisma
    .$transaction(
      async (tx) => {
        const taken = await tx.demoRequest.count({ where: { scheduledAt, status: { in: OPEN } } });
        if (taken >= DEMO.capacityPerSlot) throw new ConflictError("That slot was just taken — please choose another time");
        return tx.demoRequest.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            restaurantName: input.restaurantName,
            city: input.city,
            outlets: input.outlets,
            restaurantType: input.restaurantType,
            currentSystem: input.currentSystem,
            message: input.message,
            scheduledAt,
            durationMinutes: DEMO.durationMinutes,
            ipAddress: meta.ip ?? null,
            userAgent: meta.userAgent?.slice(0, 255) ?? null,
          },
        });
      },
      { isolationLevel: "Serializable" },
    )
    .catch((error: { code?: string }) => {
      // Two visitors grabbing the last place at once: one wins, the other picks again.
      if (error?.code === "P2034") throw new ConflictError("That slot was just taken — please choose another time");
      throw error;
    });

  await auditPlatform(
    { actor: { userId: null, name: input.name, role: "Website visitor" }, meta },
    {
      action: "demo.requested",
      entity: "DemoRequest",
      entityId: demo.id,
      summary: `${input.name} (${input.restaurantName}) booked a demo for ${whenLabel(scheduledAt)}`,
    },
  );

  const when = whenLabel(scheduledAt);
  await mailer.send({
    to: input.email,
    subject: `Your ${BRAND.name} demo — ${when}`,
    text: `Hi ${input.name.split(" ")[0]},\n\nThanks for booking a ${BRAND.name} demo for ${input.restaurantName}.\n\nWhen: ${when} (${DEMO.durationMinutes} minutes)\n\nA product specialist will call ${input.phone} to confirm and share the meeting link. Need to change the time? Just reply to this email.\n\n— Team ${BRAND.name}`,
  });
  await mailer.send({
    to: BRAND.supportEmail,
    subject: `New demo request: ${input.restaurantName} (${when})`,
    text: `${input.name} · ${input.email} · ${input.phone}\n${input.restaurantName}${input.city ? `, ${input.city}` : ""} · ${input.outlets} outlet(s)\n\nReview it in the platform console → Demo requests.`,
  });

  return { id: demo.id, scheduledAt: demo.scheduledAt.toISOString() };
}

// ─── Console ────────────────────────────────────────────────────────────────

const DEMO_SORTS = ["scheduledAt", "createdAt", "restaurantName"] as const;

export async function listDemoRequests(sp: SearchParams) {
  const view = param(sp, "status") ?? "upcoming";
  const params = parseListParams(sp, {
    sortable: DEMO_SORTS,
    defaultSort: view === "upcoming" ? "scheduledAt" : "createdAt",
    defaultDir: view === "upcoming" ? "asc" : "desc",
  });
  const now = new Date();
  const from = param(sp, "from");
  const to = param(sp, "to");

  const scheduledAt: Prisma.DateTimeFilter = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) scheduledAt.gte = demoInstant(from, "00:00");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) scheduledAt.lt = demoInstant(addDaysToDate(to, 1), "00:00");

  // "Upcoming" keeps a demo visible for an hour after it starts.
  const recent = new Date(now.getTime() - 60 * 60_000);
  if (view === "upcoming" && (!scheduledAt.gte || scheduledAt.gte < recent)) scheduledAt.gte = recent;
  const hasRange = Object.keys(scheduledAt).length > 0;

  const where: Prisma.DemoRequestWhereInput = {
    ...(view === "upcoming" ? { status: { in: OPEN } } : view === "all" ? {} : { status: view as DemoStatus }),
    ...(hasRange ? { scheduledAt } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
            { phone: { contains: params.q } },
            { restaurantName: { contains: params.q, mode: "insensitive" } },
            { city: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const [total, rows, byStatus, upcoming, thisWeek, converted, admins] = await Promise.all([
    prisma.demoRequest.count({ where }),
    prisma.demoRequest.findMany({
      where,
      orderBy: [{ [params.sort]: params.dir }, { id: "asc" }],
      skip: params.skip,
      take: params.pageSize,
      include: {
        assignedTo: { select: { id: true, name: true } },
        restaurant: { select: { id: true, name: true } },
      },
    }),
    prisma.demoRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.demoRequest.count({ where: { status: { in: OPEN }, scheduledAt: { gte: new Date(now.getTime() - 60 * 60_000) } } }),
    prisma.demoRequest.count({ where: { status: { in: OPEN }, scheduledAt: { gte: now, lt: weekEnd } } }),
    prisma.demoRequest.count({ where: { restaurantId: { not: null } } }),
    prisma.user.findMany({ where: { platformRole: { not: null }, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<Record<DemoStatus, number>>;
  const all = byStatus.reduce((s, x) => s + x._count._all, 0);

  return {
    view,
    params,
    total,
    rows: rows.map(serializeDemo),
    counts: { ...counts, all, upcoming },
    stats: { new: counts.NEW ?? 0, upcoming, thisWeek, completed: counts.COMPLETED ?? 0, converted, all },
    admins,
  };
}

function serializeDemo(d: Prisma.DemoRequestGetPayload<{ include: { assignedTo: { select: { id: true; name: true } }; restaurant: { select: { id: true; name: true } } } }>) {
  const { date, time } = demoParts(d.scheduledAt);
  return {
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    restaurantName: d.restaurantName,
    city: d.city,
    outlets: d.outlets,
    restaurantType: d.restaurantType,
    currentSystem: d.currentSystem,
    message: d.message,
    scheduledAt: d.scheduledAt.toISOString(),
    date,
    time,
    durationMinutes: d.durationMinutes,
    status: d.status,
    meetingLink: d.meetingLink,
    adminNotes: d.adminNotes,
    assignedTo: d.assignedTo,
    restaurant: d.restaurant,
    source: d.source,
    confirmedAt: d.confirmedAt?.toISOString() ?? null,
    completedAt: d.completedAt?.toISOString() ?? null,
    cancelledAt: d.cancelledAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export type DemoRow = ReturnType<typeof serializeDemo>;

/** Timestamps that follow a status change. */
function statusStamps(from: DemoStatus, to: DemoStatus, now = new Date()) {
  if (from === to) return {};
  return {
    ...(to === "CONFIRMED" ? { confirmedAt: now } : {}),
    ...(to === "COMPLETED" ? { completedAt: now } : {}),
    ...(to === "CANCELLED" ? { cancelledAt: now } : {}),
  };
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

const FIELD_LABELS: Record<string, string> = {
  scheduledAt: "time",
  durationMinutes: "duration",
  status: "status",
  name: "name",
  email: "email",
  phone: "phone",
  restaurantName: "restaurant",
  city: "city",
  outlets: "outlets",
  restaurantType: "type",
  currentSystem: "current system",
  message: "message",
  meetingLink: "meeting link",
  adminNotes: "notes",
  assignedToId: "assignee",
};

/** Admins may book outside public hours or over capacity — they own the calendar. */
export async function updateDemoRequest(ctx: Pick<PlatformContext, "actor" | "meta">, input: DemoUpdateInput) {
  const before = await prisma.demoRequest.findUnique({ where: { id: input.id } });
  if (!before) throw new NotFoundError("Demo request");
  if (input.assignedToId) {
    const admin = await prisma.user.findFirst({ where: { id: input.assignedToId, platformRole: { not: null } }, select: { id: true } });
    if (!admin) throw new BusinessRuleError("Assign the demo to a platform team member");
  }

  const scheduledAt = demoInstant(input.date, input.time);
  if (Number.isNaN(scheduledAt.getTime())) throw new BusinessRuleError("Choose a valid date and time");

  const data = {
    scheduledAt,
    durationMinutes: input.durationMinutes,
    status: input.status,
    name: input.name,
    email: input.email,
    phone: input.phone,
    restaurantName: input.restaurantName,
    city: input.city,
    outlets: input.outlets,
    restaurantType: input.restaurantType,
    currentSystem: input.currentSystem,
    message: input.message,
    meetingLink: input.meetingLink,
    adminNotes: input.adminNotes,
    assignedToId: input.assignedToId,
  };
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => {
    const a = before[k];
    const b = data[k];
    return a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : (a ?? null) !== (b ?? null);
  });

  const updated = await prisma.demoRequest.update({
    where: { id: before.id },
    data: { ...data, ...statusStamps(before.status, input.status) },
  });

  const rescheduled = changed.includes("scheduledAt");
  await auditPlatform(ctx, {
    action: rescheduled ? "demo.rescheduled" : changed.includes("status") ? "demo.status_changed" : "demo.updated",
    entity: "DemoRequest",
    entityId: updated.id,
    summary: `${ctx.actor.name} updated the demo for ${updated.restaurantName}${changed.length ? ` (${changed.map((k) => FIELD_LABELS[k] ?? k).join(", ")})` : ""}${rescheduled ? ` → ${whenLabel(updated.scheduledAt)}` : ""}`,
    metadata: {
      changed,
      ...(changed.includes("status") ? { from: before.status, to: updated.status } : {}),
      ...(rescheduled ? { previous: before.scheduledAt.toISOString() } : {}),
    },
  });

  if (input.notifyCustomer && (rescheduled || changed.includes("status") || changed.includes("meetingLink"))) {
    await mailer.send({
      to: updated.email,
      subject:
        updated.status === "CANCELLED"
          ? `Your ${BRAND.name} demo has been cancelled`
          : `Your ${BRAND.name} demo — ${whenLabel(updated.scheduledAt)}`,
      text:
        updated.status === "CANCELLED"
          ? `Hi ${updated.name.split(" ")[0]},\n\nYour demo for ${updated.restaurantName} has been cancelled. Reply to this email to book a new time.\n\n— Team ${BRAND.name}`
          : `Hi ${updated.name.split(" ")[0]},\n\nYour demo for ${updated.restaurantName} is ${updated.status === "CONFIRMED" ? "confirmed" : "scheduled"} for ${whenLabel(updated.scheduledAt)} (${updated.durationMinutes} minutes).${updated.meetingLink ? `\n\nJoin here: ${updated.meetingLink}` : ""}\n\n— Team ${BRAND.name}`,
    });
  }
  return { id: updated.id, notified: input.notifyCustomer };
}

export async function setDemoStatus(ctx: Pick<PlatformContext, "actor" | "meta">, id: string, status: DemoStatus) {
  const before = await prisma.demoRequest.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("Demo request");
  if (before.status === status) return { id };
  await prisma.demoRequest.update({ where: { id }, data: { status, ...statusStamps(before.status, status) } });
  await auditPlatform(ctx, {
    action: "demo.status_changed",
    entity: "DemoRequest",
    entityId: id,
    summary: `${ctx.actor.name} marked the demo for ${before.restaurantName} as ${status.toLowerCase().replace("_", "-")}`,
    metadata: { from: before.status, to: status },
  });
  return { id };
}

export async function deleteDemoRequest(ctx: Pick<PlatformContext, "actor" | "meta">, id: string) {
  const demo = await prisma.demoRequest.findUnique({ where: { id } });
  if (!demo) throw new NotFoundError("Demo request");
  if (demo.restaurantId) throw new BusinessRuleError("This lead became a customer — keep the record");
  await prisma.demoRequest.delete({ where: { id } });
  await auditPlatform(ctx, {
    action: "demo.deleted",
    entity: "DemoRequest",
    entityId: id,
    summary: `${ctx.actor.name} deleted the demo request from ${demo.name} (${demo.restaurantName})`,
  });
}

export async function getDemoForConversion(id: string) {
  const demo = await prisma.demoRequest.findUnique({ where: { id } });
  if (!demo || demo.restaurantId) return null;
  return demo;
}

/** Open demo requests that need a reply — for the console nav badge and dashboard. */
export async function demoInbox(now = new Date()) {
  const dayEnd = demoInstant(addDaysToDate(demoParts(now).date, 1), "00:00");
  const [fresh, today] = await Promise.all([
    prisma.demoRequest.count({ where: { status: "NEW" } }),
    prisma.demoRequest.count({ where: { status: { in: OPEN }, scheduledAt: { gte: now, lt: dayEnd } } }),
  ]);
  return { fresh, today };
}

import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { ReservationsView, type ResItem } from "@/components/reservations/reservations-view";
import { Page } from "@/components/shell/page";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listReservations, zonedDateTime } from "@/server/services/reservations";
import { zonedParts } from "@/server/time";

export const metadata: Metadata = { title: "Reservations" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("reservations.view");
  const sp = await searchParams;
  const tz = ctx.restaurant.timezone;
  const today = zonedParts(new Date(), tz).ymd;
  const view = param(sp, "view") === "list" ? "list" : "calendar";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? param(sp, "date")! : today;
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month") ?? "") ? param(sp, "month")! : selectedDate.slice(0, 7);

  let where: Prisma.ReservationWhereInput;
  if (view === "calendar") {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const start = zonedDateTime(new Date(Date.UTC(y, m - 1, -6)).toISOString().slice(0, 10), "00:00", tz);
    const end = zonedDateTime(new Date(Date.UTC(y, m, 8)).toISOString().slice(0, 10), "00:00", tz);
    where = { startsAt: { gte: start, lt: end } };
  } else {
    const period = param(sp, "period") ?? "upcoming";
    const now = new Date();
    const and: Prisma.ReservationWhereInput[] = [];
    if (period === "upcoming") and.push({ startsAt: { gte: new Date(now.getTime() - 2 * 3_600_000) } });
    if (period === "today") and.push({ startsAt: { gte: zonedDateTime(today, "00:00", tz), lt: new Date(zonedDateTime(today, "00:00", tz).getTime() + 86_400_000) } });
    if (period === "past") and.push({ startsAt: { gte: new Date(now.getTime() - 30 * 86_400_000), lt: now } });
    const status = param(sp, "status");
    if (status) and.push({ status: status as never });
    const q = param(sp, "q")?.trim();
    if (q) and.push({ OR: [{ customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q.replace(/\D/g, "") || q } }] });
    where = { AND: and };
  }

  const [rows, floors, settings] = await Promise.all([
    listReservations(ctx, where),
    ctx.db.floor.findMany({ orderBy: { sortOrder: "asc" }, include: { tables: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, capacity: true } } } }),
    ctx.db.restaurantSettings.findUnique({ where: { restaurantId: ctx.restaurantId }, select: { reservationDurationMinutes: true } }),
  ]);

  const items: ResItem[] = rows.map((r) => {
    const p = zonedParts(r.startsAt, tz);
    const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(r.startsAt);
    return {
      id: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerEmail: r.customerEmail,
      startsAt: r.startsAt.toISOString(),
      localDate: p.ymd,
      localTime: time,
      durationMinutes: r.durationMinutes,
      partySize: r.partySize,
      status: r.status,
      source: r.source,
      notes: r.notes,
      table: r.table ? { id: r.table.id, name: r.table.name } : null,
      repeatGuest: (r.customer?.totalOrders ?? 0) >= 3,
    };
  });

  return (
    <Page>
      <ReservationsView
        view={view}
        items={items}
        month={month}
        selectedDate={selectedDate}
        today={today}
        tables={floors.flatMap((f) => f.tables.map((t) => ({ ...t, floor: f.name })))}
        defaultDuration={settings?.reservationDurationMinutes ?? 90}
      />
    </Page>
  );
}

import type { Metadata } from "next";
import { ReservationsView } from "@/components/reservations/reservations-view";
import { Page } from "@/components/shell/page";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { getReservations } from "@/server/services/reservations";
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

  const { rows: items, tables, defaultDurationMinutes } = await getReservations(ctx, view, month, sp);

  return (
    <Page>
      <ReservationsView
        view={view}
        items={items}
        month={month}
        selectedDate={selectedDate}
        today={today}
        tables={tables}
        defaultDuration={defaultDurationMinutes}
      />
    </Page>
  );
}

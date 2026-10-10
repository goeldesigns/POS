import { Building, CalendarClock, CalendarDays, CircleCheck, ExternalLink, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DateRangeInputs } from "@/components/admin/filters";
import { DemosTable } from "@/components/admin/demos";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { DEMO } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { requirePlatformSession } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listDemoRequests } from "@/server/services/demos";

export const metadata: Metadata = { title: "Demo requests" };

export default async function DemoRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformSession();
  const sp = await searchParams;
  const data = await listDemoRequests(sp);
  const filtered = ["q", "from", "to"].some((k) => param(sp, k));
  const c = data.counts;
  return (
    <Page>
      <PageHeader
        title="Demo requests"
        description={`Booked from the website's demo scheduler. Times are in ${DEMO.timezoneLabel}; open a request to reschedule, assign, add notes or convert it into a restaurant.`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/#demo" target="_blank">
              <ExternalLink /> Booking page
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New — awaiting reply" value={formatNumber(data.stats.new)} icon={<Inbox />} accent="info" />
        <StatCard label="Next 7 days" value={formatNumber(data.stats.thisWeek)} icon={<CalendarDays />} caption={`${data.stats.upcoming} upcoming in total`} />
        <StatCard label="Completed demos" value={formatNumber(data.stats.completed)} icon={<CircleCheck />} accent="success" />
        <StatCard
          label="Became customers"
          value={formatNumber(data.stats.converted)}
          icon={<Building />}
          accent="warning"
          caption={data.stats.completed ? `${Math.round((data.stats.converted / Math.max(1, data.stats.completed)) * 100)}% of completed demos` : undefined}
        />
      </div>
      <LinkTabs
        param="status"
        defaultValue="upcoming"
        preserve={["q", "from", "to"]}
        className="mb-4"
        items={[
          { value: "upcoming", label: "Upcoming", count: c.upcoming, icon: <CalendarClock /> },
          { value: "NEW", label: "New", count: c.NEW ?? 0 },
          { value: "CONFIRMED", label: "Confirmed", count: c.CONFIRMED ?? 0 },
          { value: "COMPLETED", label: "Completed", count: c.COMPLETED ?? 0 },
          { value: "NO_SHOW", label: "No-show", count: c.NO_SHOW ?? 0 },
          { value: "CANCELLED", label: "Cancelled", count: c.CANCELLED ?? 0 },
          { value: "all", label: "All", count: c.all },
        ]}
      />
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Name, email, phone, restaurant, city" className="sm:w-[340px]" />
            <DateRangeInputs />
          </>
        }
      >
        <DemosTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} admins={data.admins} />
      </TableCard>
    </Page>
  );
}

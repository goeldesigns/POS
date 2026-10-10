import { Archive, Building, CirclePause, CircleCheck, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RestaurantsTable } from "@/components/admin/restaurants-table";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/format";
import { requirePlatformSession } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listRestaurants } from "@/server/services/platform";

export const metadata: Metadata = { title: "Restaurants" };

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformSession();
  const sp = await searchParams;
  const data = await listRestaurants(sp);
  const filtered = ["q", "status", "plan", "billing"].some((k) => param(sp, k));
  return (
    <Page>
      <PageHeader
        title="Restaurants"
        description="Every tenant on the platform, with plan, usage and account status."
        actions={
          <Button asChild>
            <Link href="/super-admin/restaurants/new">
              <Plus /> Add restaurant
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Restaurants" value={formatNumber(data.stats.total)} icon={<Building />} caption="Active and suspended" />
        <StatCard label="Active" value={formatNumber(data.stats.active)} icon={<CircleCheck />} accent="success" />
        <StatCard label="Suspended" value={formatNumber(data.stats.suspended)} icon={<CirclePause />} accent="danger" />
        <StatCard label="Archived" value={formatNumber(data.stats.archived)} icon={<Archive />} accent="neutral" caption="Hidden, data retained" />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Name, owner, email, phone, city" className="sm:w-[320px]" />
            <FilterSelect
              param="status"
              allLabel="Active & suspended"
              className="w-[184px]"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "SUSPENDED", label: "Suspended" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
            />
            <FilterSelect param="plan" allLabel="All plans" className="w-[150px]" options={data.plans.map((p) => ({ value: p.key, label: p.name }))} />
            <FilterSelect
              param="billing"
              allLabel="Any billing state"
              className="w-[160px]"
              options={[
                { value: "TRIALING", label: "On trial" },
                { value: "ACTIVE", label: "Paying" },
                { value: "PAST_DUE", label: "Past due" },
                { value: "CANCELLED", label: "Cancelled" },
                { value: "EXPIRED", label: "Expired" },
              ]}
            />
          </>
        }
      >
        <RestaurantsTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} />
      </TableCard>
    </Page>
  );
}

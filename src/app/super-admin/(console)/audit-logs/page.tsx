import type { Metadata } from "next";
import { AuditTable } from "@/components/admin/audit-table";
import { DateRangeInputs } from "@/components/admin/filters";
import { Page } from "@/components/shell/page";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requirePlatformSession } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listAuditLogs, listRestaurantOptions } from "@/server/services/platform";

export const metadata: Metadata = { title: "Audit logs" };

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformSession();
  const sp = await searchParams;
  const [data, restaurants] = await Promise.all([listAuditLogs(sp), listRestaurantOptions()]);
  const filtered = ["q", "scope", "actor", "category", "restaurant", "from", "to"].some((k) => param(sp, k));
  return (
    <Page>
      <PageHeader
        title="Audit logs"
        description="Sign-ins, permission and plan changes, voids, refunds and other sensitive actions — across the console and every restaurant."
      />
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search summary, person or action" />
            <FilterSelect
              param="scope"
              allLabel="Console & restaurants"
              className="w-[196px]"
              options={[
                { value: "PLATFORM", label: "Console only" },
                { value: "RESTAURANT", label: "Restaurants only" },
              ]}
            />
            <FilterSelect param="restaurant" allLabel="All restaurants" className="w-[170px]" options={restaurants.map((r) => ({ value: r.id, label: r.name }))} />
            <FilterSelect param="category" allLabel="All actions" className="w-[150px]" options={data.categories.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))} />
            <FilterSelect
              param="actor"
              allLabel="Anyone"
              className="w-[150px]"
              options={[
                { value: "admins", label: "Platform admins" },
                { value: "system", label: "System" },
              ]}
            />
            <DateRangeInputs />
          </>
        }
      >
        <AuditTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} />
      </TableCard>
    </Page>
  );
}

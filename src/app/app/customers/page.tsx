import { Repeat, UserPlus, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { CustomersTable, CustomersToolbarActions } from "@/components/customers/customers-list";
import { Page } from "@/components/shell/page";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listCustomers } from "@/server/services/customers";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("customers.view");
  const sp = await searchParams;
  const data = await listCustomers(ctx, sp);
  const filtered = ["q", "segment", "tag"].some((k) => param(sp, k));
  return (
    <Page>
      <PageHeader title="Customers" description="Guest profiles, visit history and loyalty." actions={<CustomersToolbarActions />} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total customers" value={formatNumber(data.stats.customers)} icon={<Users />} />
        <StatCard label="New in last 30 days" value={formatNumber(data.stats.newThisMonth)} icon={<UserPlus />} accent="success" />
        <StatCard label="Repeat customers" value={`${data.stats.repeatRate.toFixed(0)}%`} icon={<Repeat />} accent="info" caption="2 or more orders" />
        <StatCard label="Average lifetime spend" value={formatMoney(data.stats.avgSpend, { decimals: 0 })} icon={<Wallet />} accent="warning" />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search name, phone or email" />
            <FilterSelect
              param="segment"
              allLabel="All customers"
              options={[
                { value: "vip", label: "VIP" },
                { value: "repeat", label: "Repeat (2+ orders)" },
                { value: "new", label: "New (30 days)" },
                { value: "lapsed", label: "Lapsed (60+ days)" },
              ]}
              className="w-[170px]"
            />
            {data.tags.length ? <FilterSelect param="tag" allLabel="Any tag" options={data.tags.map((t) => ({ value: t, label: t }))} className="w-[140px]" /> : null}
          </>
        }
      >
        <CustomersTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} />
      </TableCard>
    </Page>
  );
}

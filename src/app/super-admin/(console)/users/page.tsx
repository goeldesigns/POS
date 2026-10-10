import { Ban, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { AddPlatformUserButton, UsersTable } from "@/components/admin/users-table";
import { Page } from "@/components/shell/page";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/format";
import { requirePlatformSession } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listPlatformUsers } from "@/server/services/platform";

export const metadata: Metadata = { title: "Users" };

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePlatformSession();
  const sp = await searchParams;
  const data = await listPlatformUsers(sp);
  const filtered = ["q", "type", "status", "restaurant"].some((k) => param(sp, k));
  return (
    <Page>
      <PageHeader
        title="Users"
        description="Everyone with a login, across all restaurants. Roles and permissions are managed per restaurant."
        actions={<AddPlatformUserButton restaurants={data.restaurants} />}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="All users" value={formatNumber(data.stats.total)} icon={<Users />} />
        <StatCard label="Signed in · 30 days" value={formatNumber(data.stats.active)} icon={<UserCheck />} accent="success" />
        <StatCard label="Sign-in disabled" value={formatNumber(data.stats.disabled)} icon={<Ban />} accent="danger" />
        <StatCard label="Platform admins" value={formatNumber(data.stats.admins)} icon={<ShieldCheck />} accent="neutral" />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search name, email or phone" />
            <FilterSelect param="restaurant" allLabel="All restaurants" className="w-[180px]" options={data.restaurants.map((r) => ({ value: r.id, label: r.name }))} />
            <FilterSelect
              param="type"
              allLabel="All account types"
              className="w-[170px]"
              options={[
                { value: "restaurant", label: "Restaurant users" },
                { value: "platform", label: "Platform admins" },
              ]}
            />
            <FilterSelect
              param="status"
              allLabel="Any status"
              className="w-[130px]"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "DISABLED", label: "Disabled" },
              ]}
            />
          </>
        }
      >
        <UsersTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} currentUserId={ctx.user.id} />
      </TableCard>
    </Page>
  );
}

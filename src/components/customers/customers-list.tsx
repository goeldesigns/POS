"use client";

import { Download, FileUp, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatDate, formatMoney, formatNumber, formatPhone, formatRelative } from "@/lib/format";
import type { CustomerRow } from "@/server/services/customers";
import { CustomerDialog, ImportCustomersDialog } from "./customer-dialogs";

export function CustomersToolbarActions() {
  const session = useSession();
  const { searchParams, get, set } = useQueryParams();
  const [dialog, setDialog] = React.useState<"new" | "import" | null>(get("new") === "1" ? "new" : null);
  const router = useRouter();
  React.useEffect(() => {
    if (get("new") === "1") set({ new: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Button variant="outline" asChild>
        <a href={`/api/v1/customers/export?${searchParams.toString()}`}>
          <Download /> Export
        </a>
      </Button>
      {session.can("customers.create") ? (
        <>
          <Button variant="outline" onClick={() => setDialog("import")}>
            <FileUp /> Import
          </Button>
          <Button onClick={() => setDialog("new")}>
            <Plus /> Add customer
          </Button>
        </>
      ) : null}
      <CustomerDialog open={dialog === "new"} onOpenChange={(o) => setDialog(o ? "new" : null)} value={null} onSaved={(id) => router.push(`/app/customers/${id}`)} />
      <ImportCustomersDialog open={dialog === "import"} onOpenChange={(o) => setDialog(o ? "import" : null)} />
    </>
  );
}

export function CustomersTable({ rows, total, page, pageSize, filtered }: { rows: CustomerRow[]; total: number; page: number; pageSize: number; filtered: boolean }) {
  const router = useRouter();
  const session = useSession();
  const tz = session.restaurant.timezone;
  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{r.name}</p>
            <p className="truncate text-xs text-muted">
              <span className="sm:hidden">{formatPhone(r.phone)}</span>
              <span className="hidden sm:inline">{r.email ?? "No email"}</span>
            </p>
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", hideBelow: "sm", cell: (r) => <span className="tabular whitespace-nowrap">{formatPhone(r.phone)}</span> },
    { key: "totalOrders", header: "Orders", align: "right", sortable: true, hideBelow: "sm", cell: (r) => r.totalOrders },
    { key: "totalSpend", header: "Total spend", align: "right", sortable: true, cell: (r) => <span className="font-medium">{formatMoney(r.totalSpend)}</span> },
    { key: "aov", header: "Avg. order", align: "right", hideBelow: "lg", cell: (r) => formatMoney(r.aov) },
    ...(session.modules.includes("loyalty") ? [{ key: "points", header: "Points", align: "right" as const, hideBelow: "md" as const, cell: (r: CustomerRow) => formatNumber(r.points) }] : []),
    { key: "lastVisitAt", header: "Last visit", sortable: true, hideBelow: "md", cell: (r) => (r.lastVisitAt ? <span title={formatDate(r.lastVisitAt, tz)}>{formatRelative(r.lastVisitAt)}</span> : <span className="text-subtle">Never</span>) },
    { key: "createdAt", header: "Customer since", sortable: true, hideBelow: "xl", cell: (r) => formatDate(r.createdAt, tz) },
    {
      key: "tags",
      header: "Tags",
      hideBelow: "xl",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.tags.slice(0, 2).map((t) => (
            <Badge key={t} size="sm" tone={t === "VIP" ? "brand" : "neutral"}>
              {t}
            </Badge>
          ))}
        </div>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/app/customers/${r.id}`)}
        empty={
          <EmptyState
            icon={<Users />}
            title={filtered ? "No customers match" : "No customers yet"}
            description={filtered ? "Try a different name, phone number or segment." : "Customers are added from the POS, reservations or by importing a CSV."}
          />
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
    </>
  );
}

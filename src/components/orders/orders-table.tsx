"use client";

import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { ORDER_SOURCE_LABEL, ORDER_STATUS, ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from "@/lib/labels";
import type { OrderRow } from "@/server/services/order-queries";

export function OrdersTable({ rows, total, page, pageSize, filtered }: { rows: OrderRow[]; total: number; page: number; pageSize: number; filtered: boolean }) {
  const { set, get } = useQueryParams();
  const session = useSession();
  const tz = session.restaurant.timezone;

  const columns: Column<OrderRow>[] = [
    {
      key: "number",
      header: "Order ID",
      sortable: true,
      cell: (r) => (
        <div>
          <p className="font-semibold text-ink">{r.orderNumber}</p>
          {/* Phones: date and guest fold into this column; their own columns are hidden. */}
          <p className="text-2xs text-muted sm:hidden">
            {formatDate(r.createdAt, tz)}, {formatTime(r.createdAt, tz)} · {r.customerName ?? "Walk-in"}
          </p>
          {r.source !== "POS" ? (
            <p className="text-2xs text-muted">
              {ORDER_SOURCE_LABEL[r.source]}
              {r.externalRef ? ` #${r.externalRef}` : ""}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Date",
      sortable: true,
      hideBelow: "sm",
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p className="text-ink">{formatDate(r.createdAt, tz)}</p>
          <p className="text-xs text-muted">{formatTime(r.createdAt, tz)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      hideBelow: "sm",
      cell: (r) => (
        <div className="max-w-[180px]">
          <p className="truncate text-ink">{r.customerName ?? <span className="text-muted">Walk-in</span>}</p>
          {r.customerPhone ? <p className="text-xs text-muted">{r.customerPhone}</p> : null}
        </div>
      ),
    },
    { key: "table", header: "Table", hideBelow: "lg", cell: (r) => r.tableName ?? <span className="text-subtle">—</span> },
    { key: "type", header: "Type", hideBelow: "md", cell: (r) => <span className="whitespace-nowrap">{ORDER_TYPE_LABEL[r.type]}</span> },
    { key: "items", header: "Items", align: "right", hideBelow: "xl", cell: (r) => r.items },
    { key: "total", header: "Amount", align: "right", sortable: true, cell: (r) => <span className="font-semibold">{formatMoney(r.total)}</span> },
    {
      key: "payment",
      header: "Payment",
      hideBelow: "sm",
      cell: (r) =>
        r.status === "CANCELLED" && r.paymentStatus === "UNPAID" ? (
          <span className="text-subtle">—</span>
        ) : (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge dict={PAYMENT_STATUS} value={r.paymentStatus} size="sm" />
            {r.paymentMethods.length ? <span className="text-2xs text-muted">{r.paymentMethods.map((m) => PAYMENT_METHOD_LABEL[m]).join(" + ")}</span> : null}
          </div>
        ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge dict={ORDER_STATUS} value={r.status} /> },
    { key: "staff", header: "Staff", hideBelow: "xl", cell: (r) => <span className="text-ink-2">{r.staff ?? "—"}</span> },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        selectedId={get("order")}
        onRowClick={(r) => set({ order: r.id }, { scroll: false })}
        empty={
          <EmptyState
            icon={<ReceiptText />}
            title={filtered ? "No orders match these filters" : "No orders yet"}
            description={filtered ? "Try a different status, date range or search term." : "Orders from the POS, website and aggregators will appear here."}
            action={
              filtered ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/app/orders">Clear filters</Link>
                </Button>
              ) : session.can("pos.create_order") ? (
                <Button size="sm" asChild>
                  <Link href="/app/pos">Take an order</Link>
                </Button>
              ) : null
            }
          />
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
    </>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return <Badge tone={source === "SWIGGY" ? "warning" : source === "ZOMATO" ? "danger" : "neutral"}>{ORDER_SOURCE_LABEL[source]}</Badge>;
}

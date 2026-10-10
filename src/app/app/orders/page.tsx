import { Download, LayoutGrid, List, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KitchenBoard } from "@/components/orders/kitchen-board";
import { OrderDrawer } from "@/components/orders/order-drawer";
import { OrdersTable } from "@/components/orders/orders-table";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { isKitchenOnly } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { kitchenBoard, listOrders } from "@/server/services/order-queries";

export const metadata: Metadata = { title: "Orders" };

const TAB_LABELS: Record<string, string> = {
  ALL: "All",
  NEW: "New",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served · bill open",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  DRAFT: "Drafts",
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("orders.view");
  const sp = await searchParams;
  // The kitchen works from the board only — the order list carries prices and payments.
  const kitchenOnly = isKitchenOnly(ctx);
  const view = kitchenOnly || param(sp, "view") === "board" ? "board" : "list";
  const tz = ctx.restaurant.timezone;

  const viewSwitch = (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {[
        { v: "list", label: "List", icon: List, href: "/app/orders" },
        { v: "board", label: "Kitchen board", icon: LayoutGrid, href: "/app/orders?view=board" },
      ].map((o) => (
        <Link
          key={o.v}
          href={o.href}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium",
            view === o.v ? "bg-surface text-ink shadow-[0_1px_2px_rgb(20_18_48/0.08)]" : "text-muted hover:text-ink",
          )}
        >
          <o.icon className="size-3.5" /> {o.label}
        </Link>
      ))}
    </div>
  );

  const actions = kitchenOnly ? null : (
    <>
      {viewSwitch}
      {ctx.permissions.has("reports.export") && view === "list" ? (
        <Button variant="outline" asChild>
          <a href={`/api/v1/reports/orders/export?format=csv&${new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))}`}>
            <Download /> Export
          </a>
        </Button>
      ) : null}
      {ctx.permissions.has("pos.create_order") ? (
        <Button asChild>
          <Link href="/app/pos">
            <Plus /> New order
          </Link>
        </Button>
      ) : null}
    </>
  );

  if (view === "board") {
    const orders = await kitchenBoard(ctx);
    return (
      <Page>
        <PageHeader
          title="Kitchen board"
          description="Paid orders and table orders, from first ticket to hand-over. Updates every 20 seconds."
          actions={actions}
        />
        <KitchenBoard orders={orders} />
        <OrderDrawer />
      </Page>
    );
  }

  const data = await listOrders(ctx, sp, tz);
  const filtered = ["q", "type", "source", "payment", "period"].some((k) => param(sp, k));

  return (
    <Page>
      <PageHeader title="Orders" description="Every order from the POS, website and aggregators in one place." actions={actions} />
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Order #, customer, phone, table" />
            <FilterSelect
              param="period"
              allLabel="All time"
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
                { value: "90d", label: "Last 3 months" },
              ]}
              className="w-[150px]"
            />
            <FilterSelect
              param="type"
              allLabel="All types"
              options={[
                { value: "DINE_IN", label: "Dine-in" },
                { value: "TAKEAWAY", label: "Takeaway" },
                { value: "DELIVERY", label: "Delivery" },
                { value: "ONLINE", label: "Online" },
              ]}
              className="w-[140px]"
            />
            <FilterSelect
              param="source"
              allLabel="All sources"
              options={[
                { value: "POS", label: "POS" },
                { value: "SWIGGY", label: "Swiggy" },
                { value: "ZOMATO", label: "Zomato" },
                { value: "WEBSITE", label: "Website" },
              ]}
              className="w-[140px]"
            />
            <FilterSelect
              param="payment"
              allLabel="Any payment"
              options={[
                { value: "PAID", label: "Paid" },
                { value: "UNPAID", label: "Unpaid" },
                { value: "PARTIALLY_PAID", label: "Part paid" },
                { value: "REFUNDED", label: "Refunded" },
              ]}
              className="w-[140px]"
            />
          </>
        }
      >
        <div className="px-4 pt-1">
          <LinkTabs
            className="border-b-0"
            preserve={["q", "type", "source", "payment", "period"]}
            defaultValue="ALL"
            items={Object.entries(TAB_LABELS).map(([value, label]) => ({ value, label, count: data.tabCounts[value as keyof typeof data.tabCounts] }))}
          />
        </div>
        <div className="border-t border-line">
          <OrdersTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} />
        </div>
      </TableCard>
      <OrderDrawer />
    </Page>
  );
}

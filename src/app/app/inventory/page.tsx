import { AlertTriangle, Boxes, CalendarClock, PackageX, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DonutChart } from "@/components/charts/charts";
import { InventoryActions, PurchasesTable, StockTable, SuppliersTable, TxnBadge } from "@/components/inventory/inventory-views";
import { Page } from "@/components/shell/page";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/display";
import { FilterSelect, Pagination, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { formatDate, formatDateTime, formatMoney, formatQuantity, todayISO } from "@/lib/format";
import { PURCHASE_STATUS, STOCK_TXN_LABEL } from "@/lib/labels";
import { UNIT_LABELS } from "@/lib/units";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { inventoryOverview, listIngredients, listInventoryOptions, listMovements, listPurchases, listSuppliers, listWaste } from "@/server/services/inventory";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("inventory.view");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "overview";
  const tz = ctx.restaurant.timezone;
  const { suppliers, ingredients: ingredientsLite } = await listInventoryOptions(ctx);

  let body: React.ReactNode;
  if (tab === "stock") {
    const data = await listIngredients(ctx, sp);
    body = (
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Ingredient, SKU or supplier" />
            <FilterSelect param="category" allLabel="All categories" options={data.categories.map((c) => ({ value: c, label: c }))} />
            <FilterSelect param="filter" allLabel="All stock" options={[{ value: "low", label: "Low & out of stock" }, { value: "out", label: "Out of stock" }, { value: "expiring", label: "Expiring in 3 days" }]} className="w-[170px]" />
            <FilterSelect param="archived" allLabel="Active items" options={[{ value: "1", label: "Archived items" }]} className="w-[140px]" />
          </>
        }
      >
        <StockTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} suppliers={suppliers} ingredients={ingredientsLite} />
      </TableCard>
    );
  } else if (tab === "purchases") {
    const data = await listPurchases(ctx, sp);
    body = (
      <TableCard toolbar={<FilterSelect param="status" allLabel="All purchases" options={Object.entries(PURCHASE_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />}>
        <PurchasesTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} suppliers={suppliers} ingredients={ingredientsLite} />
      </TableCard>
    );
  } else if (tab === "suppliers") {
    body = (
      <TableCard>
        <SuppliersTable rows={await listSuppliers(ctx)} />
      </TableCard>
    );
  } else if (tab === "movements") {
    const data = await listMovements(ctx, sp);
    body = (
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search ingredient or reference" />
            <FilterSelect param="type" allLabel="All movements" options={Object.entries(STOCK_TXN_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </>
        }
      >
        {data.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="bg-canvas/70 text-xs text-muted">
                  {["When", "Ingredient", "Movement", "Change", "Balance", "Value", "Reference", "By"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 font-medium first:pl-5", [3, 4, 5].includes(i) ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2 pl-5 whitespace-nowrap text-muted">{formatDateTime(t.createdAt, tz)}</td>
                    <td className="px-4 py-2"><p className="font-medium text-ink">{t.ingredient}</p><p className="text-xs text-muted">{t.sku}</p></td>
                    <td className="px-4 py-2"><TxnBadge type={t.type} />{t.counterparty ? <span className="ml-1.5 text-xs text-muted">{t.counterparty}</span> : null}</td>
                    <td className={cn("tabular px-4 py-2 text-right font-semibold", t.quantity >= 0 ? "text-success-700" : "text-danger-700")}>{t.quantity > 0 ? "+" : ""}{formatQuantity(t.quantity, UNIT_LABELS[t.unit])}</td>
                    <td className="tabular px-4 py-2 text-right">{formatQuantity(t.balanceAfter)}</td>
                    <td className="tabular px-4 py-2 text-right">{formatMoney(t.value)}</td>
                    <td className="px-4 py-2 text-ink-2">{t.reference ?? t.reason ?? "—"}</td>
                    <td className="px-4 py-2 text-muted">{t.actorName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No stock movements" />
        )}
        <Pagination page={data.params.page} pageSize={data.params.pageSize} total={data.total} />
      </TableCard>
    );
  } else if (tab === "waste") {
    const data = await listWaste(ctx, sp);
    body = (
      <TableCard toolbar={<p className="text-[13px] text-muted">Waste cost in the last 30 days: <span className="font-semibold text-danger-700">{formatMoney(data.last30)}</span></p>}>
        {data.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="bg-canvas/70 text-xs text-muted">
                  {["Date", "Ingredient", "Quantity", "Reason", "Cost", "Recorded by", "Notes"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 font-medium first:pl-5", [2, 4].includes(i) ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((w) => (
                  <tr key={w.id} className="border-t border-line">
                    <td className="px-4 py-2 pl-5 whitespace-nowrap text-muted">{formatDateTime(w.createdAt, tz)}</td>
                    <td className="px-4 py-2 font-medium text-ink">{w.ingredient}</td>
                    <td className="tabular px-4 py-2 text-right">{formatQuantity(w.quantity, UNIT_LABELS[w.unit])}</td>
                    <td className="px-4 py-2">{w.reason}</td>
                    <td className="tabular px-4 py-2 text-right font-semibold text-danger-700">{formatMoney(w.cost)}</td>
                    <td className="px-4 py-2 text-muted">{w.recordedBy ?? "—"}</td>
                    <td className="px-4 py-2 text-muted">{w.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No waste recorded" description="Log spoiled, expired or spilled stock to see its true cost." />
        )}
        <Pagination page={data.params.page} pageSize={data.params.pageSize} total={data.total} />
      </TableCard>
    );
  } else {
    const o = await inventoryOverview(ctx);
    body = (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total items" value={o.stats.total} icon={<Boxes />} />
          <StatCard label="Low stock" value={o.stats.low} icon={<AlertTriangle />} accent="warning" />
          <StatCard label="Out of stock" value={o.stats.out} icon={<PackageX />} accent="danger" />
          <StatCard label="Stock value" value={formatMoney(o.stats.value)} icon={<Wallet />} accent="success" />
          <StatCard label="Expiring soon" value={o.stats.expiring} icon={<CalendarClock />} accent="info" caption="within 3 days" />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Needs reordering" actions={<Link href="/app/inventory?tab=stock&filter=low" className="text-xs font-medium text-brand-500">View all</Link>} />
            <CardBody>
              {o.lowItems.length ? (
                <ul className="divide-y divide-line">
                  {o.lowItems.map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-2 text-[13px] first:pt-0">
                      <span>
                        <span className="block font-medium text-ink">{i.name}</span>
                        <span className="text-xs text-muted">{i.supplier ?? "No supplier"}</span>
                      </span>
                      <span className={cn("tabular text-right text-xs", i.stock <= 0 ? "text-danger-700" : "text-warning-700")}>
                        {formatQuantity(i.stock, UNIT_LABELS[i.unit])}
                        <span className="block text-muted">min {formatQuantity(i.min)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-[13px] text-muted">Everything is above its minimum level.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Expiring soon" />
            <CardBody>
              {o.expiringItems.length ? (
                <ul className="divide-y divide-line">
                  {o.expiringItems.map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-2 text-[13px] first:pt-0">
                      <span className="font-medium text-ink">{i.name}</span>
                      <span className="text-right text-xs">
                        {(() => {
                          // Expiry dates are calendar dates; compare with today on the restaurant's clock.
                          const day = i.expiryDate.slice(0, 10);
                          const today = todayISO(tz);
                          return (
                            <span className={cn("block font-medium", day <= today ? "text-danger-700" : "text-warning-700")}>
                              {day < today ? `Expired ${formatDate(i.expiryDate, "UTC")}` : day === today ? "Expires today" : formatDate(i.expiryDate, "UTC")}
                            </span>
                          );
                        })()}
                        <span className="text-muted">{formatQuantity(i.stock, UNIT_LABELS[i.unit])} left</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-[13px] text-muted">Nothing expires in the next 3 days.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Stock value by category" />
            <CardBody>{o.valueByCategory.length ? <DonutChart data={o.valueByCategory} kind="money" size={150} /> : <EmptyState compact title="No stock yet" />}</CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Recent movements" actions={<Link href="/app/inventory?tab=movements" className="text-xs font-medium text-brand-500">Full ledger</Link>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <tbody>
                {o.recent.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-4 py-2 pl-5 font-medium text-ink">{t.name}</td>
                    <td className="px-4 py-2"><TxnBadge type={t.type} /></td>
                    <td className={cn("tabular px-4 py-2 text-right font-semibold", t.quantity >= 0 ? "text-success-700" : "text-danger-700")}>{t.quantity > 0 ? "+" : ""}{formatQuantity(t.quantity, UNIT_LABELS[t.unit])}</td>
                    <td className="px-4 py-2 text-muted">{t.reference ?? t.reason ?? ""}</td>
                    <td className="px-4 py-2 pr-5 text-right text-muted">{formatDateTime(t.createdAt, tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader title="Inventory" description="Ingredients, stock levels, purchases and suppliers." actions={<InventoryActions tab={tab} suppliers={suppliers} ingredients={ingredientsLite} />} />
      <LinkTabs
        className="mb-4"
        defaultValue="overview"
        items={[
          { value: "overview", label: "Overview" },
          { value: "stock", label: "Stock levels" },
          { value: "purchases", label: "Purchases" },
          { value: "suppliers", label: "Suppliers" },
          { value: "movements", label: "Ledger" },
          { value: "waste", label: "Waste" },
        ]}
      />
      {body}
    </Page>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import * as React from "react";
import { ColumnChart, DonutChart, TrendChart } from "@/components/charts/charts";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/display";
import { FilterSelect } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FilterKey, ReportColumn, ReportResult } from "@/server/services/reports";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "3M" },
  { value: "12m", label: "12M" },
  { value: "custom", label: "Custom" },
];

function fmt(kind: ReportColumn["kind"], v: string | number | null | undefined, tz: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "money") return formatMoney(Number(v), { decimals: 2 });
  if (kind === "number") return formatNumber(Number(v));
  if (kind === "qty") return formatQuantity(Number(v));
  if (kind === "percent") return `${Number(v).toFixed(1)}%`;
  if (kind === "date") return formatDate(String(v), tz);
  if (kind === "datetime") return formatDateTime(String(v), tz);
  return String(v);
}

const RIGHT = new Set(["money", "number", "percent", "qty"]);
const PAGE = 50;

export function ReportView({
  report,
  filters,
  options,
  canExport,
}: {
  report: ReportResult;
  filters: readonly FilterKey[];
  options: { staff: { value: string; label: string }[]; tables: { value: string; label: string }[]; categories: { value: string; label: string }[]; ingredientCategories: { value: string; label: string }[] };
  canExport: boolean;
}) {
  const session = useSession();
  const tz = session.restaurant.timezone;
  const { get, set, searchParams, pending } = useQueryParams();
  const period = get("period") ?? "30d";
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [report]);
  const pages = Math.max(1, Math.ceil(report.rows.length / PAGE));
  const rows = report.rows.slice((page - 1) * PAGE, page * PAGE);
  const qs = searchParams.toString();

  return (
    <div className={cn("space-y-4", pending && "opacity-70 transition-opacity")}>
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Segmented value={period} onChange={(v) => set({ period: v === "30d" ? null : v, ...(v !== "custom" ? { from: null, to: null } : {}) })} options={PERIODS} />
        {period === "custom" ? (
          <div className="flex items-center gap-1.5">
            <Input type="date" className="w-[150px]" defaultValue={get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null })} aria-label="From" />
            <span className="text-xs text-muted">to</span>
            <Input type="date" className="w-[150px]" defaultValue={get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null })} aria-label="To" />
          </div>
        ) : null}
        {filters.includes("type") ? (
          <FilterSelect param="type" allLabel="All order types" className="w-[150px]" options={[{ value: "DINE_IN", label: "Dine-in" }, { value: "TAKEAWAY", label: "Takeaway" }, { value: "DELIVERY", label: "Delivery" }, { value: "ONLINE", label: "Online" }]} />
        ) : null}
        {filters.includes("payment") ? (
          <FilterSelect param="payment" allLabel="All payment types" className="w-[160px]" options={[{ value: "CASH", label: "Cash" }, { value: "CARD", label: "Card" }, { value: "UPI", label: "UPI" }, { value: "WALLET", label: "Wallet" }, { value: "OTHER", label: "Other" }]} />
        ) : null}
        {filters.includes("staff") ? <FilterSelect param="staff" allLabel="All staff" className="w-[150px]" options={options.staff} /> : null}
        {filters.includes("table") ? <FilterSelect param="table" allLabel="All tables" className="w-[130px]" options={options.tables} /> : null}
        {filters.includes("category") ? (
          <FilterSelect param="category" allLabel="All categories" className="w-[160px]" options={report.key === "inventory" ? options.ingredientCategories : options.categories} />
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">{report.periodLabel}</span>
          {canExport ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/v1/reports/${report.key}/export?${qs}`}>
                  <Download /> CSV
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(`/print/report/${report.key}?${qs}`, "_blank")}>
                <FileText /> PDF
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {report.summary.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[13px] text-muted">{s.label}</p>
            <p className="mt-0.5 text-[22px] leading-tight font-semibold text-ink">{fmt(s.kind === "money" ? "money" : s.kind, s.value, tz).replace(/\.00$/, "")}</p>
            {s.hint ? <p className="mt-1 truncate text-xs text-muted">{s.hint}</p> : null}
          </Card>
        ))}
      </div>

      {report.chart && report.chart.data.some((d) => d.value) ? (
        <Card>
          <CardHeader title={report.chart.label} description={report.periodLabel} />
          <CardBody>
            {report.chart.type === "trend" ? (
              <TrendChart data={report.chart.data} xKey="label" current="value" kind={report.chart.kind} currentLabel={report.chart.label} />
            ) : report.chart.type === "donut" ? (
              <DonutChart data={report.chart.data} kind={report.chart.kind} size={180} />
            ) : (
              <ColumnChart data={report.chart.data} xKey="label" yKey="value" label={report.chart.label} kind={report.chart.kind} height={260} />
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {report.rows.length === 0 ? (
          <EmptyState title="No data for this period" description="Try a longer date range or fewer filters." />
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key} className={cn("sticky top-0 border-b border-line bg-canvas/80 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5", RIGHT.has(c.kind) ? "text-right" : "text-left")}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn("border-b border-line last:border-0 hover:bg-canvas", String(r[report.columns[0]!.key] ?? "").match(/^(Gross profit|Net profit|Total operating)/) && "bg-canvas font-semibold")}>
                      {report.columns.map((c) => (
                        <td key={c.key} className={cn("px-4 py-2.5 text-ink first:pl-5 last:pr-5", RIGHT.has(c.kind) && "tabular text-right", c.kind === "money" && typeof r[c.key] === "number" && (r[c.key] as number) < 0 && "text-danger-700")}>
                          {fmt(c.kind, r[c.key], tz)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {report.totals && page === pages ? (
                  <tfoot>
                    <tr className="border-t-2 border-line-strong bg-canvas font-semibold">
                      {report.columns.map((c) => (
                        <td key={c.key} className={cn("px-4 py-2.5 text-ink first:pl-5 last:pr-5", RIGHT.has(c.kind) && "tabular text-right")}>
                          {report.totals![c.key] !== undefined ? fmt(c.kind, report.totals![c.key], tz) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
                <span>
                  {report.rows.length.toLocaleString("en-IN")} rows · page {page} of {pages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon-sm" aria-label="Previous" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="outline" size="icon-sm" aria-label="Next" disabled={page === pages} onClick={() => setPage(page + 1)}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

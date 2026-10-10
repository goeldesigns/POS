import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { csvResponse, toCsv } from "@/lib/csv";
import { tenantRoute } from "@/server/api/handler";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { filtersFrom, isReportKey, REPORT_DEFS, runReport, type ReportColumn } from "@/server/services/reports";

function cell(col: ReportColumn, v: string | number | null | undefined, tz: string) {
  if (v === null || v === undefined) return "";
  if (col.kind === "money" && typeof v === "number") return (v / 100).toFixed(2);
  if (col.kind === "percent" && typeof v === "number") return v.toFixed(1);
  // Report dates are UTC instants (ISO) or plain "yyyy-MM-dd" keys; write them as the restaurant's wall clock.
  if ((col.kind === "date" || col.kind === "datetime") && typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    return format(new TZDate(v, tz), col.kind === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm");
  }
  return v;
}

/** CSV export for any report (or the Orders list via ?period/type/…). */
export const GET = tenantRoute<{ report: string }>({ permission: "reports.export" }, async (req, ctx, { report }) => {
  if (!isReportKey(report)) throw new NotFoundError("Report");
  const def = REPORT_DEFS[report] as { module?: string };
  const modules = "modules" in ctx ? (ctx.modules as ReadonlySet<string>) : new Set<string>();
  if (def.module && !modules.has(def.module)) throw new ForbiddenError("This report needs a module that isn't enabled for your restaurant");
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (report === "orders" && !sp.period) sp.period = "90d";
  const result = await runReport(ctx, report, filtersFrom(sp));
  const rows = [...result.rows, ...(result.totals ? [result.totals] : [])].map((r) =>
    Object.fromEntries(result.columns.map((c) => [c.key, cell(c, r[c.key], ctx.restaurant.timezone)])),
  );
  return csvResponse(`${report}-${result.periodLabel.replace(/\s+/g, "-").toLowerCase()}.csv`, toCsv(result.columns, rows));
});

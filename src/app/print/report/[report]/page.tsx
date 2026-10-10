import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoPrint } from "@/components/print/auto-print";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatQuantity } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { filtersFrom, isReportKey, runReport, type ReportColumn } from "@/server/services/reports";

export const metadata: Metadata = { title: "Report" };

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

/** A4 print layout — the browser's "Save as PDF" produces the PDF export. */
export default async function PrintReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("reports.export");
  const { report } = await params;
  if (!isReportKey(report)) notFound();
  const r = await runReport(ctx, report, filtersFrom(await searchParams));
  const tz = ctx.restaurant.timezone;
  const right = (k: string) => ["money", "number", "percent", "qty"].includes(k);
  return (
    <>
      <style>{`@media print { @page { size: A4 ${r.columns.length > 7 ? "landscape" : "portrait"}; margin: 12mm; } }`}</style>
      <AutoPrint />
      <article className="mx-auto max-w-[1000px] bg-white p-8 text-[11px] text-black shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between border-b-2 border-black pb-3">
          <div>
            <p className="text-[10px] tracking-widest text-neutral-500 uppercase">{ctx.restaurant.name}</p>
            <h1 className="text-xl font-bold">{r.title}</h1>
            <p className="text-neutral-600">{r.description}</p>
          </div>
          <div className="text-right text-neutral-600">
            <p className="font-semibold text-black">{r.periodLabel}</p>
            <p>Generated {formatDateTime(new Date(), tz)}</p>
            <p>by {ctx.user.name}</p>
          </div>
        </header>
        <section className="my-4 grid grid-cols-4 gap-3">
          {r.summary.map((s) => (
            <div key={s.label} className="rounded border border-neutral-300 p-2.5">
              <p className="text-neutral-500">{s.label}</p>
              <p className="text-base font-bold">{fmt(s.kind, s.value, tz)}</p>
              {s.hint ? <p className="text-[9px] text-neutral-500">{s.hint}</p> : null}
            </div>
          ))}
        </section>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {r.columns.map((c) => (
                <th key={c.key} className={`border-b border-black px-1.5 py-1 font-semibold ${right(c.kind) ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.slice(0, 2000).map((row, i) => (
              <tr key={i} className="break-inside-avoid border-b border-neutral-200">
                {r.columns.map((c) => (
                  <td key={c.key} className={`px-1.5 py-1 ${right(c.kind) ? "text-right tabular-nums" : ""}`}>
                    {fmt(c.kind, row[c.key], tz)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {r.totals ? (
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                {r.columns.map((c) => (
                  <td key={c.key} className={`px-1.5 py-1 ${right(c.kind) ? "text-right" : ""}`}>
                    {r.totals![c.key] !== undefined ? fmt(c.kind, r.totals![c.key], tz) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
        {r.rows.length > 2000 ? <p className="mt-2 text-neutral-500">Showing the first 2,000 rows — use CSV export for the full data.</p> : null}
        <footer className="mt-6 border-t border-neutral-300 pt-2 text-[9px] text-neutral-500">Tabla POS · {ctx.restaurant.name} · Confidential</footer>
      </article>
    </>
  );
}

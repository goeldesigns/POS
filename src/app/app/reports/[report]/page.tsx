import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReportView } from "@/components/reports/report-view";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { filtersFrom, isReportKey, REPORT_DEFS, reportFilterOptions, runReport } from "@/server/services/reports";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("reports.view");
  const { report } = await params;
  if (!isReportKey(report)) notFound();
  const def = REPORT_DEFS[report];
  if ("module" in def && !ctx.modules.has(def.module)) redirect(`/app/no-access?required=${def.module}.view`);
  const sp = await searchParams;
  const [result, options] = await Promise.all([runReport(ctx, report, filtersFrom(sp)), reportFilterOptions(ctx)]);
  return (
    <Page>
      <PageHeader title={def.title} description={def.description} breadcrumbs={[{ label: "Reports", href: "/app/reports" }, { label: def.title }]} />
      <ReportView report={result} filters={def.filters} options={options} canExport={ctx.permissions.has("reports.export")} />
    </Page>
  );
}

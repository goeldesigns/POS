import { CalendarDays, CalendarRange, ChartPie, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { ColumnChart, DonutChart } from "@/components/charts/charts";
import { ExpensesTable, NewExpenseButton } from "@/components/expenses/expenses-client";
import { Page } from "@/components/shell/page";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/display";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney } from "@/lib/format";
import { EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { listExpenses } from "@/server/services/expenses";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("expenses.view");
  const data = await listExpenses(ctx, await searchParams);
  return (
    <Page>
      <PageHeader title="Expenses" description="Operating costs, supplier payments and bills." actions={<NewExpenseButton />} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Total · ${data.periodLabel.toLowerCase()}`} value={formatMoney(data.stats.range)} icon={<Wallet />} />
        <StatCard label="This month" value={formatMoney(data.stats.month)} icon={<CalendarRange />} accent="info" />
        <StatCard label="This week" value={formatMoney(data.stats.week)} icon={<CalendarDays />} accent="success" />
        <StatCard label="Highest category" value={data.stats.top ? formatMoney(data.stats.top.amount) : "—"} caption={data.stats.top?.label} icon={<ChartPie />} accent="warning" />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Monthly trend" description="Last 6 months · current month highlighted" />
          <CardBody>
            <ColumnChart data={data.trend} xKey="label" yKey="amount" label="Expenses" highlightKey="current" height={300} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By category" description={data.periodLabel} />
          <CardBody>{data.byCategory.length ? <DonutChart data={data.byCategory} kind="money" size={150} /> : <EmptyState compact title="No expenses yet" />}</CardBody>
        </Card>
      </div>
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search expense, vendor or notes" />
            <FilterSelect param="period" allLabel="Last 30 days" options={[{ value: "7d", label: "Last 7 days" }, { value: "month", label: "This month" }, { value: "90d", label: "Last 3 months" }, { value: "12m", label: "Last 12 months" }]} />
            <FilterSelect param="category" allLabel="All categories" options={Object.entries(EXPENSE_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
            <FilterSelect param="method" allLabel="Any payment" options={Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))} className="w-[140px]" />
          </>
        }
      >
        <ExpensesTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} />
      </TableCard>
    </Page>
  );
}

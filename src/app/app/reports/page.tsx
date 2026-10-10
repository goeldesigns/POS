import { ArrowRight, Armchair, BadgePercent, Boxes, ChartLine, CreditCard, IdCard, Landmark, LayoutList, ReceiptText, Tags, Users, UtensilsCrossed, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/shell/page";
import { Card } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { groupBy } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { REPORT_DEFS, type ReportKey } from "@/server/services/reports";

export const metadata: Metadata = { title: "Reports" };

const ICONS: Record<ReportKey, React.ElementType> = {
  sales: ChartLine,
  orders: ReceiptText,
  payments: CreditCard,
  discounts: BadgePercent,
  tax: Landmark,
  products: UtensilsCrossed,
  categories: Tags,
  staff: IdCard,
  tables: Armchair,
  customers: Users,
  inventory: Boxes,
  expenses: Wallet,
  pnl: LayoutList,
};

export default async function ReportsPage() {
  const ctx = await requirePagePermission("reports.view");
  const available = (Object.entries(REPORT_DEFS) as [ReportKey, (typeof REPORT_DEFS)[ReportKey]][]).filter(
    ([, d]) => !("module" in d) || ctx.modules.has(d.module),
  );
  const groups = groupBy(available, ([, d]) => d.group);
  return (
    <Page>
      <PageHeader title="Reports" description="Every report can be filtered by date and exported to CSV or PDF." />
      <div className="space-y-6">
        {Object.entries(groups).map(([group, items]) => (
          <section key={group}>
            <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase">{group}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {items.map(([key, d]) => {
                const Icon = ICONS[key];
                return (
                  <Link key={key} href={`/app/reports/${key}`} className="group">
                    <Card className="flex h-full items-start gap-3 p-4 transition-[border-color,box-shadow] group-hover:border-brand-200 group-hover:shadow-raised">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-500">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between text-sm font-semibold text-ink">
                          {d.title}
                          <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{d.description}</span>
                      </span>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}

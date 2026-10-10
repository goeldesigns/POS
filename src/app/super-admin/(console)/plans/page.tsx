import { CreditCard, Repeat, TriangleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import { PlansBoard } from "@/components/admin/plans";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney, formatNumber } from "@/lib/format";
import { requirePlatformSession } from "@/server/auth/guards";
import { getPlatformSettings, listPlans } from "@/server/services/platform";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  await requirePlatformSession();
  const [plans, settings] = await Promise.all([listPlans(), getPlatformSettings()]);
  const mrr = plans.reduce((s, p) => s + p.mrr, 0);
  const paying = plans.reduce((s, p) => s + p.activeSubscribers, 0);
  const trialing = plans.reduce((s, p) => s + p.trialing, 0);
  const pastDue = plans.reduce((s, p) => s + p.pastDue, 0);
  return (
    <Page>
      <PageHeader title="Plans" description="Pricing, limits and the modules each plan switches on. Online billing (Stripe / Razorpay) plugs into these later." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly recurring revenue" value={formatMoney(mrr, { decimals: 0 })} icon={<Repeat />} caption={`ARR ${formatMoney(mrr * 12, { decimals: 0 })}`} />
        <StatCard label="Paying restaurants" value={formatNumber(paying)} icon={<Users />} accent="success" />
        <StatCard label="On trial" value={formatNumber(trialing)} icon={<CreditCard />} accent="info" />
        <StatCard label="Past due" value={formatNumber(pastDue)} icon={<TriangleAlert />} accent="danger" />
      </div>
      <PlansBoard plans={plans} defaultPlanKey={settings.defaultPlanKey} />
    </Page>
  );
}

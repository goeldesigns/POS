import type { Metadata } from "next";
import { headers } from "next/headers";
import { IntegrationCards } from "@/components/integrations/integration-cards";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/server/auth/guards";
import { getIntegrations } from "@/server/services/integrations";

export const metadata: Metadata = { title: "Swiggy & Zomato" };

export default async function IntegrationsPage() {
  const ctx = await requirePagePermission(["swiggy.view", "zomato.view"]);
  const data = await getIntegrations(ctx);
  const h = await headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <Page>
      <PageHeader title="Swiggy & Zomato" description="Aggregator connections and incoming online orders." />
      <IntegrationCards data={data} webhookBase={base} slug={ctx.restaurant.slug} sandbox={process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true"} />
    </Page>
  );
}

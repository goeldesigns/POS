import type { Metadata } from "next";
import { CreateRestaurantForm } from "@/components/admin/restaurant-form";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { requirePlatformSession } from "@/server/auth/guards";
import { getPlatformSettings, listPlans } from "@/server/services/platform";
import { getDemoForConversion } from "@/server/services/demos";
import { param, type SearchParams } from "@/server/list-params";
import { InlineAlert } from "@/components/ui/display";
import { CORE_MODULES, isModuleKey } from "@/lib/permissions/catalog";

export const metadata: Metadata = { title: "Add restaurant" };

export default async function NewRestaurantPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformSession();
  const demoId = param(await searchParams, "demo");
  const [plans, settings, demo] = await Promise.all([listPlans(), getPlatformSettings(), demoId ? getDemoForConversion(demoId) : null]);
  const options = plans
    .filter((p) => p.isActive)
    .map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      trialDays: p.trialDays,
      maxUsers: p.maxUsers,
      maxTables: p.maxTables,
      modules: [...new Set([...CORE_MODULES, ...p.features.filter(isModuleKey)])],
    }));
  return (
    <Page className="max-w-[1180px]">
      <PageHeader
        title="Add restaurant"
        description="Creates a ready-to-use workspace: roles, owner login, tables, tax and a subscription."
        breadcrumbs={[{ label: "Restaurants", href: "/super-admin/restaurants" }, { label: "Add restaurant" }]}
      />
      {demo ? (
        <InlineAlert tone="brand" className="mb-4" title={`From the demo with ${demo.name}`}>
          Details are pre-filled from their demo request. The request is marked completed and linked to the new restaurant when you save.
        </InlineAlert>
      ) : null}
      <CreateRestaurantForm
        plans={options}
        defaultPlanKey={settings.defaultPlanKey}
        prefill={
          demo
            ? { demoRequestId: demo.id, name: demo.restaurantName, ownerName: demo.name, email: demo.email, phone: demo.phone, city: demo.city, restaurantType: demo.restaurantType }
            : null
        }
      />
    </Page>
  );
}

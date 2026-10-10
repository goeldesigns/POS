import type { Metadata } from "next";
import { Page } from "@/components/shell/page";
import { FloorPlan } from "@/components/tables/floor-plan";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/server/auth/guards";
import { getFloorPlan } from "@/server/services/tables";

export const metadata: Metadata = { title: "Tables" };

export default async function TablesPage() {
  const ctx = await requirePagePermission("tables.view");
  const floors = await getFloorPlan(ctx);
  const tables = floors.flatMap((f) => f.tables);
  const occupied = tables.filter((t) => t.status === "OCCUPIED").length;
  return (
    <Page>
      <PageHeader
        title="Tables"
        description={`${occupied} of ${tables.length} tables occupied · tap a table to start or open its order`}
      />
      <FloorPlan floors={floors} />
    </Page>
  );
}

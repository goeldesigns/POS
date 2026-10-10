import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/menu/product-editor";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/server/auth/guards";
import { getProductEditorData } from "@/server/services/menu";

export const metadata: Metadata = { title: "Menu item" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const ctx = await requirePagePermission(isNew ? "menu.create" : "menu.view");
  const data = await getProductEditorData(ctx, isNew ? null : id).catch(() => null);
  if (!data) notFound();
  return (
    <Page className="pb-0 lg:pb-0">
      <PageHeader
        title={data.product ? data.product.name : "New menu item"}
        breadcrumbs={[{ label: "Menu", href: "/app/menu" }, { label: data.product ? data.product.name : "New item" }]}
      />
      <ProductEditor data={data} />
    </Page>
  );
}

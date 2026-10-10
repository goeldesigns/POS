import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoriesPanel, ModifierGroupsPanel } from "@/components/menu/catalog-panels";
import { ProductsTable } from "@/components/menu/products-table";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listCategories, listModifierGroups, listProducts } from "@/server/services/menu";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("menu.view");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "items";
  const categories = await listCategories(ctx);

  return (
    <Page>
      <PageHeader
        title="Menu"
        description="Items, categories and add-ons that power the POS."
        actions={
          ctx.permissions.has("menu.create") ? (
            <Button asChild>
              <Link href="/app/menu/products/new">
                <Plus /> Add menu item
              </Link>
            </Button>
          ) : null
        }
      />
      <LinkTabs
        className="mb-4"
        defaultValue="items"
        items={[
          { value: "items", label: "Items", count: categories.reduce((s, c) => s + c.products, 0) },
          { value: "categories", label: "Categories", count: categories.length },
          { value: "modifiers", label: "Modifier groups" },
        ]}
      />
      {tab === "categories" ? (
        <CategoriesPanel rows={categories} />
      ) : tab === "modifiers" ? (
        <ModifierGroupsPanel rows={await listModifierGroups(ctx)} />
      ) : (
        <ItemsTab sp={sp} categories={categories} ctx={ctx} />
      )}
    </Page>
  );
}

async function ItemsTab({ sp, categories, ctx }: { sp: SearchParams; categories: Awaited<ReturnType<typeof listCategories>>; ctx: Awaited<ReturnType<typeof requirePagePermission>> }) {
  const data = await listProducts(ctx, sp);
  const filtered = ["q", "category", "availability", "food", "kind"].some((k) => param(sp, k));
  return (
    <TableCard
      toolbar={
        <>
          <SearchParamInput placeholder="Search name, SKU or barcode" />
          <FilterSelect param="category" allLabel="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect
            param="availability"
            allLabel="Any availability"
            options={[
              { value: "available", label: "Available" },
              { value: "soldout", label: "Sold out" },
              { value: "inactive", label: "Hidden" },
            ]}
          />
          <FilterSelect
            param="food"
            allLabel="All food types"
            options={[
              { value: "VEG", label: "Veg" },
              { value: "NON_VEG", label: "Non-veg" },
              { value: "EGG", label: "Egg" },
              { value: "VEGAN", label: "Vegan" },
            ]}
          />
          <FilterSelect param="kind" allLabel="Items & combos" options={[{ value: "combo", label: "Combos only" }]} className="w-[150px]" />
        </>
      }
    >
      <ProductsTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} filtered={filtered} />
    </TableCard>
  );
}

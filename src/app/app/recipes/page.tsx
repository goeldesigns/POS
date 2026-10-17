import { ChefHat, CircleAlert, Percent, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/pos/product-image";
import { Page } from "@/components/shell/page";
import { Badge, EmptyState } from "@/components/ui/display";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { listRecipes } from "@/server/services/recipes";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("recipes.view");
  const data = await listRecipes(ctx, await searchParams);
  const { categories } = data;
  return (
    <Page>
      <PageHeader title="Recipes" description="Cost every dish, keep food cost on target, and deduct ingredients automatically on each sale." />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Menu items" value={data.stats.total} icon={<UtensilsCrossed />} />
        <StatCard label="Recipes costed" value={`${data.stats.costed} of ${data.stats.total}`} icon={<ChefHat />} accent="success" />
        <StatCard label="Average food cost" value={data.stats.avgFoodCost != null ? `${data.stats.avgFoodCost.toFixed(1)}%` : "—"} icon={<Percent />} accent="info" />
        <StatCard label="Above target" value={data.stats.high} icon={<CircleAlert />} accent={data.stats.high ? "danger" : "neutral"} caption={`${data.stats.missing} without a recipe`} />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search dishes" />
            <FilterSelect param="category" allLabel="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            <FilterSelect param="status" allLabel="Any status" options={[{ value: "ok", label: "On target" }, { value: "high", label: "Above target" }, { value: "missing", label: "No recipe" }]} />
          </>
        }
      >
        {data.rows.length === 0 ? (
          <EmptyState icon={<ChefHat />} title="No dishes match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="bg-canvas/70 text-xs text-muted">
                  {["Dish", "Price", "Ingredients", "Cost / portion", "Food cost", "Suggested price", "Margin", ""].map((h, i) => (
                    <th key={i} className={cn("px-4 py-2.5 font-medium first:pl-5", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.productId} className="border-t border-line hover:bg-canvas">
                    <td className="px-4 py-2.5 pl-5">
                      <Link href={`/app/recipes/${r.productId}`} className="flex items-center gap-3">
                        <ProductImage src={r.imageUrl} name={r.name} className="size-9 rounded-lg" />
                        <span>
                          <span className="block font-medium text-ink hover:text-brand-600">{r.name}</span>
                          <span className="block text-xs text-muted">{r.category}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="tabular px-4 text-right">{formatMoney(r.price)}</td>
                    <td className="tabular px-4 text-right">{r.ingredients || "—"}</td>
                    <td className="tabular px-4 text-right font-medium">{r.cost != null ? formatMoney(r.cost, { decimals: 2 }) : "—"}</td>
                    <td className="px-4 text-right">
                      {r.foodCostPercent != null ? (
                        <span className={cn("tabular font-semibold", r.state === "high" ? "text-danger-700" : "text-success-700")}>{r.foodCostPercent.toFixed(1)}%</span>
                      ) : (
                        "—"
                      )}
                      {r.target != null ? <span className="block text-2xs text-muted">target {r.target}%</span> : null}
                    </td>
                    <td className="tabular px-4 text-right">{r.suggestedPrice != null ? formatMoney(r.suggestedPrice) : "—"}</td>
                    <td className="tabular px-4 text-right">{r.margin != null ? formatMoney(r.margin) : "—"}</td>
                    <td className="px-4 pr-5 text-right">
                      {r.state === "missing" ? <Badge size="sm" tone="warning">Add recipe</Badge> : r.state === "high" ? <Badge size="sm" tone="danger">Review</Badge> : <Badge size="sm" tone="success">On target</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
    </Page>
  );
}

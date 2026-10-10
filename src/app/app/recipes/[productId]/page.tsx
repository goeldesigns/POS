import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { Page } from "@/components/shell/page";
import { FoodTypeMark } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/guards";
import { getRecipeEditor } from "@/server/services/recipes";

export const metadata: Metadata = { title: "Recipe" };

export default async function RecipePage({ params }: { params: Promise<{ productId: string }> }) {
  const ctx = await requirePagePermission("recipes.view");
  const { productId } = await params;
  const data = await getRecipeEditor(ctx, productId).catch(() => null);
  if (!data) notFound();
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Recipes", href: "/app/recipes" }, { label: data.product.name }]}
        title={
          <span className="flex items-center gap-2">
            <FoodTypeMark type={data.product.foodType} /> {data.product.name}
          </span>
        }
        description={`${data.product.category.name} · sells at ${formatMoney(data.product.price)}`}
        actions={
          ctx.permissions.has("menu.view") ? (
            <Link href={`/app/menu/products/${data.product.id}`} className="text-[13px] font-medium text-brand-500 hover:text-brand-600">
              Edit menu item →
            </Link>
          ) : null
        }
      />
      <RecipeEditor data={data} />
    </Page>
  );
}

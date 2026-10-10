"use client";

import { Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, InlineAlert } from "@/components/ui/display";
import { NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney, formatQuantity } from "@/lib/format";
import { costRecipe, lineCost } from "@/lib/recipe-cost";
import { compatibleUnits, UNIT_LABELS } from "@/lib/units";
import { cn } from "@/lib/utils";
import { recipeSchema } from "@/lib/validation/inventory";
import { deleteRecipeAction, saveRecipeAction } from "@/server/actions/inventory";
import type { getRecipeEditor } from "@/server/services/recipes";
import type { StockUnit } from "@/generated/prisma/enums";

type Data = Awaited<ReturnType<typeof getRecipeEditor>>;

export function RecipeEditor({ data }: { data: Data }) {
  const router = useRouter();
  const session = useSession();
  const { product, ingredients } = data;
  const r = product.recipe;
  const byId = React.useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const form = useZodForm(recipeSchema, {
    productId: product.id,
    yieldQuantity: String(r?.yieldQuantity ?? 1),
    wastePercent: String(r?.wastePercent ?? 3),
    targetFoodCost: String(r?.targetFoodCost ?? 30),
    instructions: r?.instructions ?? "",
    prepTimeMinutes: r?.prepTimeMinutes != null ? String(r.prepTimeMinutes) : product.preparationTime != null ? String(product.preparationTime) : "",
    ingredients: r?.ingredients.map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity), unit: l.unit, wastePercent: String(l.wastePercent) })) ?? [],
  });
  const lines = useFieldArray({ control: form.control, name: "ingredients" });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const canEdit = session.can(r ? "recipes.edit" : "recipes.create");
  const submit = useFormSubmit(form, saveRecipeAction, { success: "Recipe saved", onSuccess: () => router.refresh() });
  const del = useAction(deleteRecipeAction, { success: "Recipe deleted", onSuccess: () => router.push("/app/recipes") });

  const v = form.watch();
  const costLines = (v.ingredients ?? [])
    .map((l) => {
      const ing = byId.get(l.ingredientId);
      return ing ? { quantity: Number(l.quantity) || 0, unit: l.unit as StockUnit, wastePercent: Number(l.wastePercent) || 0, ingredient: { unit: ing.unit, costPerUnit: ing.costPerUnit } } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const costing = costRecipe({
    lines: costLines,
    yieldQuantity: Number(v.yieldQuantity) || 1,
    wastePercent: Number(v.wastePercent) || 0,
    targetFoodCost: Number(v.targetFoodCost) || 30,
    sellingPrice: product.price,
  });
  const target = Number(v.targetFoodCost) || 30;
  const over = costing.foodCostPercent != null && costing.foodCostPercent > target;
  const ingredientsError = form.formState.errors.ingredients?.message ?? form.formState.errors.ingredients?.root?.message;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Ingredients" description="Quantities for one batch. Stock is deducted per portion sold." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-y border-line bg-canvas/70 text-xs text-muted">
                  <th className="px-4 py-2 pl-5 text-left font-medium">Ingredient</th>
                  <th className="w-[110px] px-2 py-2 text-left font-medium">Quantity</th>
                  <th className="w-[96px] px-2 py-2 text-left font-medium">Unit</th>
                  <th className="w-[90px] px-2 py-2 text-left font-medium">Waste %</th>
                  <th className="w-[100px] px-2 py-2 text-right font-medium">Cost</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.fields.map((f, i) => {
                  const line = v.ingredients?.[i];
                  const ing = line ? byId.get(line.ingredientId) : undefined;
                  const cost = ing && line ? lineCost({ quantity: Number(line.quantity) || 0, unit: line.unit as StockUnit, wastePercent: Number(line.wastePercent) || 0, ingredient: ing }, Number(v.wastePercent) || 0) : 0;
                  return (
                    <tr key={f.id} className="border-b border-line align-top">
                      <td className="px-4 py-2 pl-5">
                        <Controller
                          control={form.control}
                          name={`ingredients.${i}.ingredientId`}
                          render={({ field }) => (
                            <NativeSelect
                              value={field.value}
                              onChange={(e) => {
                                field.onChange(e.target.value);
                                const picked = byId.get(e.target.value);
                                if (picked) form.setValue(`ingredients.${i}.unit`, picked.unit === "KG" ? "G" : picked.unit === "LTR" ? "ML" : picked.unit);
                              }}
                            >
                              <option value="">Choose ingredient…</option>
                              {ingredients.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name} · {formatMoney(x.costPerUnit)}/{UNIT_LABELS[x.unit]}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        />
                        {ing ? <p className="mt-1 text-2xs text-muted">In stock: {formatQuantity(ing.currentStock, UNIT_LABELS[ing.unit])}</p> : null}
                      </td>
                      <td className="px-2 py-2">
                        <TextField control={form.control} name={`ingredients.${i}.quantity`} inputMode="decimal" />
                      </td>
                      <td className="px-2 py-2">
                        <Controller
                          control={form.control}
                          name={`ingredients.${i}.unit`}
                          render={({ field }) => (
                            <NativeSelect value={field.value} onChange={field.onChange}>
                              {(ing ? compatibleUnits(ing.unit) : (["G", "KG", "ML", "LTR", "PCS"] as StockUnit[])).map((u) => (
                                <option key={u} value={u}>
                                  {UNIT_LABELS[u]}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <TextField control={form.control} name={`ingredients.${i}.wastePercent`} inputMode="decimal" suffix="%" />
                      </td>
                      <td className="tabular px-2 py-2 pt-4 text-right font-medium text-ink">{formatMoney(Math.round(cost), { decimals: 2 })}</td>
                      <td className="py-2 pr-3">
                        <Button variant="ghost" size="icon" aria-label="Remove ingredient" onClick={() => lines.remove(i)}>
                          <Trash />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => lines.append({ ingredientId: "", quantity: "", unit: "G", wastePercent: "0" })}>
              <Plus /> Add ingredient
            </Button>
            {ingredientsError ? <p className="text-xs text-danger-700">{ingredientsError}</p> : null}
            {!ingredients.length ? (
              <Link href="/app/inventory?tab=stock" className="text-xs font-medium text-brand-500">
                Add ingredients in Inventory first →
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Method" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <TextField control={form.control} name="yieldQuantity" label="Yield (portions)" inputMode="numeric" description="Portions per batch" />
              <TextField control={form.control} name="wastePercent" label="Recipe waste" suffix="%" inputMode="decimal" description="Trim & cooking loss" />
              <TextField control={form.control} name="targetFoodCost" label="Target food cost" suffix="%" inputMode="decimal" />
              <TextField control={form.control} name="prepTimeMinutes" label="Prep time" suffix="min" inputMode="numeric" optional />
            </div>
            <TextareaField control={form.control} name="instructions" label="Preparation instructions" optional className="[&_textarea]:min-h-[140px]" placeholder={"1. Marinate…\n2. Cook…\n3. Plate…"} />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader title="Costing" description={`Selling price ${formatMoney(product.price)}`} />
          <CardBody className="space-y-4">
            <dl className="space-y-2 text-[13px]">
              <Row label="Ingredient cost (batch)" value={formatMoney(costing.batchCost, { decimals: 2 })} />
              <Row label="Cost per portion" value={formatMoney(costing.portionCost, { decimals: 2 })} strong />
              <Row label="Gross margin per portion" value={costing.margin != null ? formatMoney(costing.margin, { decimals: 2 }) : "—"} />
            </dl>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13px] text-muted">Food cost</span>
                <span className={cn("text-xl font-semibold", over ? "text-danger-700" : "text-success-700")}>
                  {costing.foodCostPercent != null ? `${costing.foodCostPercent.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-sunken">
                <div className={cn("h-full rounded-full", over ? "bg-danger" : "bg-success")} style={{ width: `${Math.min(100, costing.foodCostPercent ?? 0)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${Math.min(100, target)}%` }} title={`Target ${target}%`} />
              </div>
              <p className="mt-1 text-xs text-muted">Target {target}% · marker shows target</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-150">
              <p className="text-xs text-brand-700">Suggested selling price</p>
              <p className="text-lg font-semibold text-ink">{formatMoney(costing.suggestedPrice)}</p>
              <p className="text-xs text-muted">Hits {target}% food cost, rounded up to ₹5.</p>
            </div>
            {over ? (
              <InlineAlert tone="warning">Above target — consider a price of {formatMoney(costing.suggestedPrice)} or reducing portion costs.</InlineAlert>
            ) : null}
          </CardBody>
        </Card>
        <div className="flex gap-2">
          {r && session.can("recipes.delete") ? (
            <Button variant="danger-soft" onClick={() => setConfirmDelete(true)}>
              <Trash /> Delete
            </Button>
          ) : null}
          <Button type="submit" className="flex-1" loading={form.formState.isSubmitting} disabled={!canEdit}>
            {r ? "Save recipe" : "Create recipe"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete the recipe for ${product.name}?`}
        description="Sales of this item will stop deducting ingredients from stock."
        confirmLabel="Delete recipe"
        loading={del.pending}
        onConfirm={() => del.execute({ productId: product.id })}
      />
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", strong ? "text-base font-semibold text-ink" : "font-medium text-ink")}>{value}</dd>
    </div>
  );
}

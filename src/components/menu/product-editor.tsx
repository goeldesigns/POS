"use client";

import { ChefHat, Flame, Plus, Star, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { CheckboxField, SelectField, SwitchField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { ImageInput } from "@/components/forms/file-upload";
import { ProductImage } from "@/components/pos/product-image";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Card, FoodTypeMark, InlineAlert } from "@/components/ui/display";
import { Field, FormSection } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/input";
import { formatMoney, toMinor } from "@/lib/format";
import { productSchema } from "@/lib/validation/menu";
import { saveProductAction } from "@/server/actions/menu";
import type { getProductEditorData } from "@/server/services/menu";

type EditorData = Awaited<ReturnType<typeof getProductEditorData>>;

function suggestSku(name: string, category: string) {
  const c = category.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "IT";
  const n = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
  return n ? `${c}-${n}` : "";
}

export function ProductEditor({ data }: { data: EditorData }) {
  const router = useRouter();
  const session = useSession();
  const p = data.product;
  const form = useZodForm(productSchema, {
    id: p?.id,
    name: p?.name ?? "",
    sku: p?.sku ?? "",
    categoryId: p?.categoryId ?? data.categories[0]?.id ?? "",
    description: p?.description ?? "",
    price: p ? String(p.price / 100) : "",
    costPrice: p?.costPrice != null ? String(p.costPrice / 100) : "",
    imageUrl: p?.imageUrl ?? null,
    taxRateId: p?.taxRateId ?? "",
    foodType: p?.foodType ?? "VEG",
    isActive: p?.isActive ?? true,
    isAvailable: p?.isAvailable ?? true,
    isFeatured: p?.isFeatured ?? false,
    isBestseller: p?.isBestseller ?? false,
    isSpicy: p?.isSpicy ?? false,
    trackStock: p?.trackStock ?? true,
    preparationTime: p?.preparationTime != null ? String(p.preparationTime) : "",
    barcode: p?.barcode ?? "",
    kitchenStation: p?.kitchenStation ?? "",
    variants: (p?.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: String(v.price / 100), isDefault: v.isDefault })),
    modifierGroupIds: p?.modifierGroups.map((g) => g.modifierGroupId) ?? [],
    isCombo: p?.isCombo ?? false,
    comboItems: (p?.comboItems ?? []).map((c) => ({ productId: c.productId, quantity: String(c.quantity) })),
  });
  const variants = useFieldArray({ control: form.control, name: "variants" });
  const combo = useFieldArray({ control: form.control, name: "comboItems" });
  const v = form.watch();
  const canSave = session.can(p ? "menu.edit" : "menu.create");

  const submit = useFormSubmit(form, saveProductAction, {
    success: p ? "Menu item updated" : "Menu item added",
    onSuccess: (r) => {
      if (!p) router.replace(`/app/menu/products/${r.id}`);
      else router.refresh();
    },
  });

  const previewPrice = v.variants?.length ? Math.min(...v.variants.map((x) => toMinor(x.price || 0))) : toMinor(v.price || 0);
  const cost = v.costPrice ? toMinor(v.costPrice) : null;
  const margin = cost != null && previewPrice > 0 ? ((previewPrice - cost) / previewPrice) * 100 : null;
  const category = data.categories.find((c) => c.id === v.categoryId)?.name ?? "";
  const comboValue = (v.comboItems ?? []).reduce((s, c) => s + (data.comboCandidates.find((x) => x.id === c.productId)?.price ?? 0) * (Number(c.quantity) || 0), 0);

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="px-5">
          <FormSection title="Basics" description="How the item appears on the POS, receipts and future online menu.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="name"
                label="Item name"
                required
                autoFocus={!p}
                onBlur={() => {
                  if (!form.getValues("sku") && form.getValues("name")) form.setValue("sku", suggestSku(form.getValues("name"), category));
                }}
              />
              <TextField control={form.control} name="sku" label="SKU" required description="Short unique code, e.g. MC-BTC" className="[&_input]:uppercase" />
            </div>
            {/* Food type keeps its natural width; the category select takes the rest. */}
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <SelectField control={form.control} name="categoryId" label="Category" required options={data.categories.map((c) => ({ value: c.id, label: c.name }))} />
              <Field label="Food type" required>
                <Controller
                  control={form.control}
                  name="foodType"
                  render={({ field }) => (
                    <Segmented
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "VEG", label: "Veg", icon: <FoodTypeMark type="VEG" /> },
                        { value: "NON_VEG", label: "Non-veg", icon: <FoodTypeMark type="NON_VEG" /> },
                        { value: "EGG", label: "Egg", icon: <FoodTypeMark type="EGG" /> },
                        { value: "VEGAN", label: "Vegan", icon: <FoodTypeMark type="VEGAN" /> },
                      ]}
                    />
                  )}
                />
              </Field>
            </div>
            <TextareaField control={form.control} name="description" label="Description" optional className="mt-4 [&_textarea]:min-h-[70px]" placeholder="One or two lines your guests will read." />
          </FormSection>

          <FormSection title="Photo" description="Shown on POS product cards.">
            <Controller control={form.control} name="imageUrl" render={({ field, fieldState }) => (
              <div>
                <ImageInput value={field.value ?? null} onChange={field.onChange} />
                {fieldState.error ? <p className="mt-1 text-xs text-danger-700">{fieldState.error.message}</p> : null}
              </div>
            )} />
          </FormSection>

          <FormSection title="Pricing & tax" description="Prices are entered before tax unless your restaurant uses tax-inclusive pricing.">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
              {variants.fields.length ? (
                <Field label="Price" description="Set per size below">
                  <p className="flex h-9 items-center text-[13px] text-muted">from {formatMoney(previewPrice)}</p>
                </Field>
              ) : (
                <TextField control={form.control} name="price" label="Price" required prefix="₹" inputMode="decimal" />
              )}
              <TextField control={form.control} name="costPrice" label="Cost price" optional prefix="₹" inputMode="decimal" description={margin != null ? `Margin ${margin.toFixed(0)}%` : "Or let the recipe calculate it"} />
              <SelectField
                control={form.control}
                name="taxRateId"
                label="Tax"
                placeholder={`Default (${data.taxRates.find((t) => t.isDefault)?.name ?? "none"})`}
                options={data.taxRates.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
            <div className="mt-4">
              <p className="text-[13px] font-medium text-ink-2">Sizes / variants</p>
              <p className="mb-2 text-xs text-muted">Half & Full, Regular & Large… The cashier picks one when adding the item.</p>
              {variants.fields.map((f, i) => (
                <div key={f.id} className="mb-2 flex items-start gap-2">
                  <TextField control={form.control} name={`variants.${i}.name`} placeholder="e.g. Half" className="flex-1" />
                  <TextField control={form.control} name={`variants.${i}.price`} placeholder="0" prefix="₹" inputMode="decimal" className="w-[130px]" />
                  <label className="flex h-9 items-center gap-1.5 text-xs text-muted">
                    <input suppressHydrationWarning
                      type="radio"
                      className="accent-brand-500"
                      checked={!!v.variants?.[i]?.isDefault}
                      onChange={() => v.variants?.forEach((_, j) => form.setValue(`variants.${j}.isDefault`, i === j))}
                    />
                    Default
                  </label>
                  <Button variant="ghost" size="icon" aria-label="Remove variant" onClick={() => variants.remove(i)}>
                    <Trash />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => variants.append({ name: "", price: v.price || "", isDefault: variants.fields.length === 0 })}>
                <Plus /> Add size
              </Button>
            </div>
          </FormSection>

          <FormSection title="Add-ons & choices" description="Modifier groups shown when this item is added.">
            {data.modifierGroups.length ? (
              <Controller
                control={form.control}
                name="modifierGroupIds"
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.modifierGroups.map((g) => {
                      const on = (field.value ?? []).includes(g.id);
                      return (
                        <label key={g.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 hover:border-line-strong">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(c) => field.onChange(c ? [...(field.value ?? []), g.id] : (field.value ?? []).filter((x: string) => x !== g.id))}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-ink">{g.name}</span>
                            <span className="block truncate text-xs text-muted">{g.modifiers.map((m) => m.name).join(", ")}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
            ) : (
              <p className="text-[13px] text-muted">
                No modifier groups yet. Create them under <Link className="font-medium text-brand-500" href="/app/menu?tab=modifiers">Menu → Modifier groups</Link>.
              </p>
            )}
          </FormSection>

          <FormSection title="Combo" description="Bundle several items at one price. Stock is deducted from each item's recipe.">
            <CheckboxField control={form.control} name="isCombo" label="This item is a combo / meal" />
            {v.isCombo ? (
              <div className="mt-3 space-y-2">
                {combo.fields.map((f, i) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <SelectField control={form.control} name={`comboItems.${i}.productId`} placeholder="Choose item" options={data.comboCandidates.map((c) => ({ value: c.id, label: `${c.name} · ${formatMoney(c.price)}` }))} className="flex-1" />
                    <TextField control={form.control} name={`comboItems.${i}.quantity`} inputMode="numeric" className="w-[80px]" />
                    <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => combo.remove(i)}>
                      <Trash />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => combo.append({ productId: "", quantity: "1" })}>
                    <Plus /> Add item
                  </Button>
                  {comboValue ? (
                    <span className="text-xs text-muted">
                      Items worth {formatMoney(comboValue)}
                      {previewPrice && comboValue > previewPrice ? ` · guest saves ${formatMoney(comboValue - previewPrice)}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Kitchen" description="Routing and timing for kitchen tickets.">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="preparationTime" label="Prep time" optional suffix="min" inputMode="numeric" />
              <Controller
                control={form.control}
                name="kitchenStation"
                render={({ field }) => (
                  <Field label="Kitchen station" optional>
                    <NativeSelect value={field.value ?? ""} onChange={field.onChange}>
                      <option value="">Main kitchen</option>
                      {data.kitchenStations.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              />
              <TextField control={form.control} name="barcode" label="Barcode" optional />
            </div>
          </FormSection>

          <FormSection title="Visibility" description="Control where and how the item shows up.">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              <SwitchField control={form.control} name="isActive" label="Active on POS" description="Hidden items keep their history." />
              <SwitchField control={form.control} name="isAvailable" label="Available now" description="Turn off when sold out today." />
              <SwitchField control={form.control} name="isBestseller" label="Bestseller" description="Shown under Popular." />
              <SwitchField control={form.control} name="isFeatured" label="Featured" description="Highlighted for upselling." />
              <SwitchField control={form.control} name="isSpicy" label="Spicy" />
              <SwitchField control={form.control} name="trackStock" label="Deduct inventory" description="Uses the recipe on every sale." />
            </div>
          </FormSection>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="p-4">
            <p className="mb-3 text-2xs font-semibold tracking-wide text-muted uppercase">POS preview</p>
            <div className="mx-auto w-[190px] rounded-xl border border-line bg-surface p-2 shadow-card">
              <div className="relative">
                <ProductImage src={v.imageUrl ?? null} name={v.name || "New item"} className="aspect-[4/3] w-full rounded-lg" />
                <span className="absolute top-1.5 left-1.5 rounded-[5px] bg-white/95 p-[3px]">
                  <FoodTypeMark type={v.foodType} />
                </span>
                {v.isBestseller ? (
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700">
                    <Star className="size-2.5 fill-current" /> Bestseller
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 px-1 text-[13px] font-medium text-ink">
                {v.name || "Item name"} {v.isSpicy ? <Flame className="inline size-3 text-danger" /> : null}
              </p>
              <div className="flex items-center justify-between px-1 pt-1.5 pb-0.5">
                <span className="text-[13px] font-semibold text-brand-500">{formatMoney(previewPrice)}</span>
                <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-brand-600">
                  <Plus className="size-4" />
                </span>
              </div>
            </div>
            {!v.isAvailable || !v.isActive ? (
              <p className="mt-3 text-center text-xs text-danger-700">{!v.isActive ? "Hidden from the POS" : "Shown as sold out"}</p>
            ) : null}
          </Card>
          {p && !p.isCombo && session.can("recipes.view") ? (
            <Card className="p-4">
              <p className="text-[13px] font-semibold text-ink">Recipe & costing</p>
              <p className="mt-1 text-xs text-muted">{p.recipe ? "Ingredients are deducted from stock on each sale." : "No recipe yet — add one to track food cost and stock."}</p>
              <Button asChild variant="secondary" size="sm" className="mt-3">
                <Link href={`/app/recipes/${p.id}`}>
                  <ChefHat /> {p.recipe ? "Open recipe" : "Add recipe"}
                </Link>
              </Button>
            </Card>
          ) : null}
          {!canSave ? <InlineAlert tone="warning">You can view this item but not change it.</InlineAlert> : null}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex items-center justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7">
        <Button variant="outline" asChild>
          <Link href="/app/menu">Cancel</Link>
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting} disabled={!canSave}>
          {p ? "Save changes" : "Add to menu"}
        </Button>
      </div>
    </form>
  );
}

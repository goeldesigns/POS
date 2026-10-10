"use client";

import { Flame, ListFilter, Plus, Search, Star, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { EmptyState, FoodTypeMark, Kbd } from "@/components/ui/display";
import { Input, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { PillTabs } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "./pos-store";
import { ProductImage } from "./product-image";

interface Filters {
  bestseller: boolean;
  availableOnly: boolean;
  spicy: boolean;
}

export function ProductGrid({
  products,
  categories,
  cartQty,
  onPick,
  searchRef,
  resetKey = 0,
}: {
  products: Product[];
  categories: { id: string; name: string }[];
  cartQty: Map<string, number>;
  onPick: (product: Product) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Changes when a new order starts: clear the search and go back to all items. */
  resetKey?: number;
}) {
  const [tab, setTab] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [foodType, setFoodType] = React.useState("");
  const [filters, setFilters] = React.useState<Filters>({ bestseller: false, availableOnly: false, spicy: false });

  React.useEffect(() => {
    if (!resetKey) return;
    setQuery("");
    setTab("all");
  }, [resetKey]);

  const tabs = React.useMemo(() => {
    const withItems = new Set(products.map((p) => p.categoryId));
    return [
      { value: "all", label: "All Items" },
      { value: "popular", label: "Popular" },
      ...categories.filter((c) => withItems.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [categories, products]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase();
        if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
      } else if (tab === "popular") {
        if (!p.isBestseller && !p.isFeatured) return false;
      } else if (tab !== "all" && p.categoryId !== tab) return false;
      if (foodType === "VEG" && !(p.foodType === "VEG" || p.foodType === "VEGAN")) return false;
      if (foodType && foodType !== "VEG" && p.foodType !== foodType) return false;
      if (filters.bestseller && !p.isBestseller) return false;
      if (filters.availableOnly && !p.isAvailable) return false;
      if (filters.spicy && !p.isSpicy) return false;
      return true;
    });
  }, [products, query, tab, foodType, filters]);

  const activeFilters = Number(filters.bestseller) + Number(filters.availableOnly) + Number(filters.spicy);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 pt-3 pb-3">
        <PillTabs
          items={tabs}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setQuery("");
          }}
          className="min-w-0 flex-1 pr-10 [mask-image:linear-gradient(90deg,#000_calc(100%-48px),transparent)]"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <ListFilter /> Filter
              {activeFilters ? <span className="grid size-4 place-items-center rounded-full bg-brand-500 text-[10px] text-white">{activeFilters}</span> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[230px] p-3">
            <p className="mb-2 text-2xs font-semibold tracking-wide text-muted uppercase">Show only</p>
            {(
              [
                ["bestseller", "Bestsellers"],
                ["spicy", "Spicy dishes"],
                ["availableOnly", "Available now"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] hover:bg-sunken">
                <Checkbox checked={filters[key]} onCheckedChange={(v) => setFilters((f) => ({ ...f, [key]: v === true }))} />
                {label}
              </label>
            ))}
            {activeFilters ? (
              <Button variant="ghost" size="xs" className="mt-1 w-full" onClick={() => setFilters({ bestseller: false, availableOnly: false, spicy: false })}>
                Clear filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        <Input
          ref={searchRef}
          className="min-w-0 flex-1"
          prefix={<Search />}
          placeholder="Search menu items…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visible[0]) {
              e.preventDefault();
              const first = visible.find((p) => p.isAvailable);
              if (first) onPick(first);
            } else if (e.key === "Escape") {
              setQuery("");
              (e.target as HTMLInputElement).blur();
            }
          }}
          suffix={
            query ? (
              <button suppressHydrationWarning type="button" aria-label="Clear search" onClick={() => setQuery("")} className="rounded p-0.5 text-subtle hover:text-ink">
                <X />
              </button>
            ) : (
              <Kbd className="hidden sm:inline-flex">/</Kbd>
            )
          }
        />
        <NativeSelect value={foodType} onChange={(e) => setFoodType(e.target.value)} className="w-[150px] shrink-0" aria-label="Food type">
          <option value="">All food types</option>
          <option value="VEG">Vegetarian</option>
          <option value="NON_VEG">Non-vegetarian</option>
          <option value="EGG">Contains egg</option>
        </NativeSelect>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4 scrollbar-thin">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title={query ? `No items match “${query}”` : "No items here yet"}
            description={query ? "Try a shorter name, the SKU, or scan a barcode." : "Add products to this category from the Menu page."}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} qty={cartQty.get(p.id) ?? 0} onPick={() => onPick(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ProductCard = React.memo(function ProductCard({ product: p, qty, onPick }: { product: Product; qty: number; onPick: () => void }) {
  const fromPrice = p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : p.price;
  return (
    <button suppressHydrationWarning
      type="button"
      onClick={onPick}
      disabled={!p.isAvailable}
      aria-label={`Add ${p.name}`}
      className={cn(
        "group relative flex flex-col rounded-xl border border-line bg-surface p-2 text-left shadow-card transition-[border-color,box-shadow,transform] duration-150",
        p.isAvailable ? "hover:border-brand-300 hover:shadow-raised active:scale-[0.985]" : "cursor-not-allowed",
        qty > 0 && "border-brand-300 ring-1 ring-brand-200",
      )}
    >
      <div className="relative">
        <ProductImage src={p.imageUrl} name={p.name} className={cn("aspect-[4/3] w-full rounded-lg", !p.isAvailable && "grayscale opacity-60")} />
        <span className="absolute top-1.5 left-1.5 rounded-[5px] bg-white/95 p-[3px] shadow-sm">
          <FoodTypeMark type={p.foodType} />
        </span>
        {p.isBestseller ? (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700 shadow-sm">
            <Star className="size-2.5 fill-current" /> Bestseller
          </span>
        ) : null}
        {!p.isAvailable ? (
          <span className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-md bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-white">Sold out</span>
        ) : null}
        {qty > 0 ? (
          <span className="absolute -right-1 -bottom-1 grid h-6 min-w-6 place-items-center rounded-full bg-brand-500 px-1.5 text-xs font-semibold text-white ring-2 ring-white">
            {qty}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-2 pb-0.5">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium text-ink">
          {p.name}
          {p.isSpicy ? <Flame className="ml-1 inline size-3 -translate-y-px text-danger" aria-label="Spicy" /> : null}
        </p>
        {p.comboSummary ? <p className="mt-0.5 line-clamp-1 text-2xs text-muted">{p.comboSummary}</p> : null}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className="text-[13px] font-semibold text-brand-500">
            {p.variants.length > 1 ? <span className="text-2xs font-normal text-muted">from </span> : null}
            {formatMoney(fromPrice)}
          </span>
          {p.isAvailable ? (
            <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white" aria-hidden>
              <Plus className="size-4" />
            </span>
          ) : (
            <span className="text-2xs font-medium text-subtle">Unavailable</span>
          )}
        </div>
      </div>
    </button>
  );
});

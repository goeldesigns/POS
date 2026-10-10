"use client";

import { BookOpen, ChefHat, Ellipsis, Pencil, Plus, Star, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ProductImage } from "@/components/pos/product-image";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Badge, EmptyState, FoodTypeMark } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney, formatNumber } from "@/lib/format";
import { deleteProductAction, toggleProductAction } from "@/server/actions/menu";
import type { ProductRow } from "@/server/services/menu";

export function ProductsTable({ rows, total, page, pageSize, filtered }: { rows: ProductRow[]; total: number; page: number; pageSize: number; filtered: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<ProductRow | null>(null);
  const toggle = useAction(toggleProductAction);
  const del = useAction(deleteProductAction, { success: "Item removed from the menu", onSuccess: () => setDeleting(null) });
  const canEdit = session.can("menu.edit");

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Item",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <ProductImage src={r.imageUrl} name={r.name} className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <FoodTypeMark type={r.foodType} />
              <span className="truncate">{r.name}</span>
              {r.isBestseller ? <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Bestseller" /> : null}
              {r.isCombo ? <Badge size="sm" tone="brand">Combo</Badge> : null}
            </p>
            <p className="text-xs text-muted">{r.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      hideBelow: "sm",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: r.categoryColor ?? "#9a99a5" }} />
          {r.category}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      sortable: true,
      align: "right",
      cell: (r) => (
        <span className="font-medium">
          {r.fromPrice != null ? <span className="text-2xs font-normal text-muted">from </span> : null}
          {formatMoney(r.fromPrice ?? r.price)}
        </span>
      ),
    },
    { key: "sold", header: "Sold (30d)", align: "right", hideBelow: "lg", cell: (r) => formatNumber(r.sold30d) },
    {
      key: "recipe",
      header: "Recipe",
      hideBelow: "xl",
      cell: (r) => (r.hasRecipe ? <Badge size="sm" tone="success">Costed</Badge> : r.isCombo ? <span className="text-xs text-subtle">From items</span> : <Badge size="sm">Not set</Badge>),
    },
    {
      key: "available",
      header: "In stock",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
          <Switch
            size="sm"
            checked={r.isAvailable}
            disabled={!canEdit || !r.isActive}
            onCheckedChange={(v) => toggle.execute({ id: r.id, field: "isAvailable", value: v })}
            aria-label={`${r.name} available`}
          />
          {!r.isActive ? <Badge size="sm">Inactive</Badge> : !r.isAvailable ? <span className="text-xs text-danger-700">Sold out</span> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`${r.name} actions`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link href={`/app/menu/products/${r.id}`}>
                  <Pencil /> Edit item
                </Link>
              </DropdownMenuItem>
              {session.can("recipes.view") && !r.isCombo ? (
                <DropdownMenuItem asChild>
                  <Link href={`/app/recipes/${r.id}`}>
                    <ChefHat /> {r.hasRecipe ? "View recipe" : "Add recipe"}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                <DropdownMenuItem onSelect={() => toggle.execute({ id: r.id, field: "isActive", value: !r.isActive })}>
                  {r.isActive ? "Hide from POS" : "Show on POS"}
                </DropdownMenuItem>
              ) : null}
              {session.can("menu.delete") ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem tone="danger" onSelect={() => setDeleting(r)}>
                    <Trash /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        dense
        onRowClick={(r) => router.push(`/app/menu/products/${r.id}`)}
        empty={
          <EmptyState
            icon={<BookOpen />}
            title={filtered ? "No items match" : "Your menu is empty"}
            description={filtered ? "Try another category or search term." : "Add your first dish — it appears on the POS immediately."}
            action={
              !filtered && session.can("menu.create") ? (
                <Button size="sm" asChild>
                  <Link href="/app/menu/products/new">
                    <Plus /> Add menu item
                  </Link>
                </Button>
              ) : null
            }
          />
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="It disappears from the POS. Past orders and reports keep their history."
        confirmLabel="Delete item"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </>
  );
}

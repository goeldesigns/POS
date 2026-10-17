"use client";

import { ArrowDownToLine, ArrowLeftRight, Boxes, ClipboardCheck, Ellipsis, PackageCheck, Pencil, Plus, Recycle, Trash, Truck, X } from "lucide-react";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatDateTime, formatMoney, formatPhone, formatQuantity } from "@/lib/format";
import { PURCHASE_STATUS, STOCK_TXN_LABEL } from "@/lib/labels";
import { UNIT_LABELS } from "@/lib/units";
import { cn, pluralize } from "@/lib/utils";
import { cancelPurchaseAction, deleteIngredientAction, deleteSupplierAction, receivePurchaseAction } from "@/server/actions/inventory";
import type { IngredientRow, PurchaseRow, SupplierRow } from "@/server/services/inventory";
import type { StockUnit } from "@/lib/enums";
import { IngredientDialog, MovementDialog, PurchaseDialog, SupplierDialog, WasteDialog } from "./inventory-dialogs";

type IngredientLite = { id: string; name: string; unit: StockUnit; costPerUnit: number; currentStock: number; supplierId: string | null };

export function InventoryActions({ tab, suppliers, ingredients }: { tab: string; suppliers: { id: string; name: string }[]; ingredients: IngredientLite[] }) {
  const session = useSession();
  const [dialog, setDialog] = React.useState<"ingredient" | "waste" | "purchase" | "supplier" | null>(null);
  return (
    <>
      {session.can("inventory.adjust_stock") ? (
        <Button variant="outline" onClick={() => setDialog("waste")}>
          <Recycle /> Record waste
        </Button>
      ) : null}
      {tab === "purchases" && session.can("inventory.add_stock") ? (
        <Button onClick={() => setDialog("purchase")}>
          <Plus /> New purchase
        </Button>
      ) : tab === "suppliers" && session.can("inventory.create") ? (
        <Button onClick={() => setDialog("supplier")}>
          <Plus /> Add supplier
        </Button>
      ) : session.can("inventory.create") ? (
        <Button onClick={() => setDialog("ingredient")}>
          <Plus /> Add ingredient
        </Button>
      ) : null}
      <IngredientDialog open={dialog === "ingredient"} onOpenChange={(o) => setDialog(o ? "ingredient" : null)} value={null} suppliers={suppliers} />
      <WasteDialog open={dialog === "waste"} onOpenChange={(o) => setDialog(o ? "waste" : null)} ingredients={ingredients} />
      <PurchaseDialog open={dialog === "purchase"} onOpenChange={(o) => setDialog(o ? "purchase" : null)} value={null} suppliers={suppliers} ingredients={ingredients} />
      <SupplierDialog open={dialog === "supplier"} onOpenChange={(o) => setDialog(o ? "supplier" : null)} value={null} />
    </>
  );
}

const STATE_BADGE: Record<string, { label: string; tone: "danger" | "warning" | "info" | "success" }> = {
  out: { label: "Out of stock", tone: "danger" },
  low: { label: "Low", tone: "warning" },
  over: { label: "Overstocked", tone: "info" },
  ok: { label: "In stock", tone: "success" },
};

export function StockTable({ rows, total, page, pageSize, suppliers, ingredients }: { rows: IngredientRow[]; total: number; page: number; pageSize: number; suppliers: { id: string; name: string }[]; ingredients: IngredientLite[] }) {
  const session = useSession();
  const [dialog, setDialog] = React.useState<{ kind: "edit" | "move" | "waste" | "delete"; row: IngredientRow; mode?: "ADD" | "ADJUST" | "TRANSFER_OUT" } | null>(null);
  const del = useAction(deleteIngredientAction, { success: (r) => (r.result === "archived" ? "Ingredient archived (it has history)" : "Ingredient deleted"), onSuccess: () => setDialog(null) });
  const can = { add: session.can("inventory.add_stock"), adjust: session.can("inventory.adjust_stock"), transfer: session.can("inventory.transfer_stock") };
  const columns: Column<IngredientRow>[] = [
    {
      key: "name",
      header: "Ingredient",
      sortable: true,
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">{r.name}</p>
          <p className="text-xs text-muted">{r.sku} · {r.category}</p>
        </div>
      ),
    },
    {
      key: "currentStock",
      header: "In stock",
      sortable: true,
      align: "right",
      cell: (r) => {
        const pct = r.maxStock ? Math.min(100, (r.currentStock / r.maxStock) * 100) : null;
        return (
          <div className="flex flex-col items-end gap-1">
            <span className={cn("font-semibold", r.state === "out" ? "text-danger-700" : r.state === "low" ? "text-warning-700" : "text-ink")}>{formatQuantity(r.currentStock, UNIT_LABELS[r.unit])}</span>
            {pct != null ? (
              <span className="h-1 w-20 overflow-hidden rounded-full bg-sunken">
                <span className={cn("block h-full rounded-full", r.state === "out" || r.state === "low" ? "bg-warning" : "bg-success")} style={{ width: `${Math.max(pct, 2)}%` }} />
              </span>
            ) : null}
          </div>
        );
      },
    },
    { key: "min", header: "Min", align: "right", hideBelow: "md", cell: (r) => <span className="text-muted">{formatQuantity(r.minStock)}</span> },
    { key: "cost", header: "Cost / unit", align: "right", hideBelow: "lg", cell: (r) => `${formatMoney(r.costPerUnit, { decimals: 2 })}/${UNIT_LABELS[r.unit]}` },
    { key: "value", header: "Value", align: "right", cell: (r) => formatMoney(r.value) },
    { key: "supplier", header: "Supplier", hideBelow: "xl", cell: (r) => r.supplier?.name ?? <span className="text-subtle">—</span> },
    {
      key: "expiry",
      header: "Expiry",
      hideBelow: "lg",
      cell: (r) => (r.expiryDate ? <span className={r.expiringSoon ? "font-medium text-danger-700" : "text-ink-2"}>{formatDate(r.expiryDate, "UTC")}</span> : <span className="text-subtle">—</span>),
    },
    { key: "state", header: "Status", cell: (r) => <Badge tone={STATE_BADGE[r.state]!.tone} dot>{STATE_BADGE[r.state]!.label}</Badge> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${r.name} actions`}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[200px]">
            {can.add ? (
              <DropdownMenuItem onSelect={() => setDialog({ kind: "move", row: r, mode: "ADD" })}>
                <ArrowDownToLine /> Stock in
              </DropdownMenuItem>
            ) : null}
            {can.adjust ? (
              <DropdownMenuItem onSelect={() => setDialog({ kind: "move", row: r, mode: "ADJUST" })}>
                <ClipboardCheck /> Stock count / adjust
              </DropdownMenuItem>
            ) : null}
            {can.transfer ? (
              <DropdownMenuItem onSelect={() => setDialog({ kind: "move", row: r, mode: "TRANSFER_OUT" })}>
                <ArrowLeftRight /> Transfer
              </DropdownMenuItem>
            ) : null}
            {can.adjust ? (
              <DropdownMenuItem onSelect={() => setDialog({ kind: "waste", row: r })}>
                <Recycle /> Record waste
              </DropdownMenuItem>
            ) : null}
            {session.can("inventory.edit") ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", row: r })}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
              </>
            ) : null}
            {session.can("inventory.delete") ? (
              <DropdownMenuItem tone="danger" onSelect={() => setDialog({ kind: "delete", row: r })}>
                <Trash /> Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
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
        empty={<EmptyState icon={<Boxes />} title="No ingredients found" description="Add the raw materials you buy and cook with to track stock and recipe costs." />}
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <IngredientDialog open={dialog?.kind === "edit"} onOpenChange={(o) => !o && setDialog(null)} value={dialog?.row ?? null} suppliers={suppliers} />
      <MovementDialog open={dialog?.kind === "move"} onOpenChange={(o) => !o && setDialog(null)} ingredient={dialog?.row ?? null} initialMode={dialog?.mode ?? "ADD"} allowed={can} />
      <WasteDialog open={dialog?.kind === "waste"} onOpenChange={(o) => !o && setDialog(null)} ingredients={ingredients} preset={dialog?.row.id} />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${dialog?.row.name}?`}
        description="Items with stock history are archived instead of deleted so your reports stay accurate."
        confirmLabel="Delete"
        loading={del.pending}
        onConfirm={() => del.execute({ id: dialog!.row.id })}
      />
    </>
  );
}

export function PurchasesTable({ rows, total, page, pageSize, suppliers, ingredients }: { rows: PurchaseRow[]; total: number; page: number; pageSize: number; suppliers: { id: string; name: string }[]; ingredients: IngredientLite[] }) {
  const session = useSession();
  const tz = session.restaurant.timezone;
  const [editing, setEditing] = React.useState<PurchaseRow | null>(null);
  const receive = useAction(receivePurchaseAction, { success: "Goods received — stock updated" });
  const cancel = useAction(cancelPurchaseAction, { success: "Purchase cancelled" });
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const columns: Column<PurchaseRow>[] = [
    {
      key: "reference",
      header: "Purchase",
      cell: (r) => (
        <div>
          <p className="font-semibold text-ink">{r.reference}</p>
          <p className="text-xs text-muted">{r.invoiceNumber ? `Bill ${r.invoiceNumber}` : "No bill no."}</p>
        </div>
      ),
    },
    { key: "supplier", header: "Supplier", cell: (r) => r.supplier ?? <span className="text-subtle">—</span> },
    {
      key: "items",
      header: "Items",
      cell: (r) => (
        <button suppressHydrationWarning type="button" className="text-left text-ink-2 hover:text-brand-600" onClick={(e) => { e.stopPropagation(); setExpanded(expanded === r.id ? null : r.id); }}>
          {pluralize(r.items.length, "item")}
          {expanded === r.id ? (
            <span className="mt-1 block space-y-0.5 text-xs text-muted">
              {r.items.map((i) => (
                <span key={i.ingredientId} className="block">
                  {i.name}: {formatQuantity(i.quantity, UNIT_LABELS[i.unit])} × {formatMoney(i.unitCost, { decimals: 2 })}
                </span>
              ))}
            </span>
          ) : null}
        </button>
      ),
    },
    { key: "createdAt", header: "Created", hideBelow: "md", cell: (r) => formatDate(r.createdAt, tz) },
    { key: "receivedAt", header: "Received", hideBelow: "lg", cell: (r) => (r.receivedAt ? formatDateTime(r.receivedAt, tz) : "—") },
    { key: "total", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{formatMoney(r.total)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge dict={PURCHASE_STATUS} value={r.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) =>
        session.can("inventory.add_stock") && (r.status === "DRAFT" || r.status === "ORDERED") ? (
          <div className="flex justify-end gap-1">
            <Button size="xs" variant="secondary" loading={receive.pending} onClick={() => receive.execute({ id: r.id })}>
              <PackageCheck /> Receive
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="More">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setEditing(r)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem tone="danger" onSelect={() => cancel.execute({ id: r.id })}>
                  <X /> Cancel purchase
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null,
    },
  ];
  return (
    <>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} empty={<EmptyState icon={<Truck />} title="No purchases yet" description="Record supplier orders to keep stock and ingredient costs accurate." />} />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <PurchaseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} value={editing} suppliers={suppliers} ingredients={ingredients} />
    </>
  );
}

export function SuppliersTable({ rows }: { rows: SupplierRow[] }) {
  const session = useSession();
  const tz = session.restaurant.timezone;
  const [editing, setEditing] = React.useState<SupplierRow | null>(null);
  const [deleting, setDeleting] = React.useState<SupplierRow | null>(null);
  const del = useAction(deleteSupplierAction, { success: (r) => (r.result === "archived" ? "Supplier archived" : "Supplier deleted"), onSuccess: () => setDeleting(null) });
  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      header: "Supplier",
      cell: (r) => (
        <div>
          <p className="font-medium text-ink">
            {r.name} {!r.isActive ? <Badge size="sm">Inactive</Badge> : null}
          </p>
          <p className="text-xs text-muted">{r.contactPerson ?? "—"}{r.paymentTerms ? ` · ${r.paymentTerms}` : ""}</p>
        </div>
      ),
    },
    { key: "phone", header: "Contact", cell: (r) => <div className="text-[13px]"><p>{r.phone ? formatPhone(r.phone) : "—"}</p><p className="text-xs text-muted">{r.email ?? ""}</p></div> },
    { key: "gst", header: "GSTIN", hideBelow: "lg", cell: (r) => <span className="font-mono text-xs">{r.gstNumber ?? "—"}</span> },
    { key: "ingredients", header: "Items supplied", align: "right", cell: (r) => r.ingredients },
    { key: "purchased", header: "Purchased", align: "right", cell: (r) => formatMoney(r.purchased) },
    { key: "last", header: "Last delivery", hideBelow: "md", cell: (r) => (r.lastPurchase ? formatDate(r.lastPurchase, tz) : "—") },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {session.can("inventory.edit") ? (
            <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
              <Pencil />
            </Button>
          ) : null}
          {session.can("inventory.delete") ? (
            <Button variant="ghost" size="icon-xs" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
              <Trash />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} empty={<EmptyState icon={<Truck />} title="No suppliers yet" description="Add vendors to link ingredients and record purchases." />} />
      <SupplierDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} value={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Suppliers with purchase history are archived instead."
        confirmLabel="Delete"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </>
  );
}

export function TxnBadge({ type }: { type: string }) {
  const tone = type === "SALE" ? "brand" : type === "PURCHASE" || type === "OPENING" || type === "TRANSFER_IN" ? "success" : type === "WASTE" ? "danger" : type === "TRANSFER_OUT" ? "warning" : "info";
  return <Badge tone={tone as never} size="sm">{STOCK_TXN_LABEL[type] ?? type}</Badge>;
}

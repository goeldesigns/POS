"use client";

import {
  ArrowRight,
  Armchair,
  ChefHat,
  Ellipsis,
  Eraser,
  Gift,
  ListOrdered,
  NotebookPen,
  Percent,
  Plus,
  Save,
  ShoppingBag,
  TicketPercent,
  Trash,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Kbd } from "@/components/ui/display";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { formatMoney, formatPhone } from "@/lib/format";
import { ORDER_STATUS, statusOf } from "@/lib/labels";
import type { PricingResult } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { CartLine, OnlineSource, OrderType, PosAction, PosState } from "./pos-store";
import { ProductImage } from "./product-image";
import { QuantityStepper } from "./pos-dialogs";

const TYPES: { value: OrderType; label: string }[] = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "ONLINE", label: "Online" },
];

export interface PanelCallbacks {
  dispatch: React.Dispatch<PosAction>;
  openTables: () => void;
  openCustomer: () => void;
  openDiscount: () => void;
  openCoupon: () => void;
  openPoints: () => void;
  openNote: () => void;
  openOrders: () => void;
  newOrder: () => void;
  saveDraft: () => void;
  sendKitchen: () => void;
  charge: () => void;
}

export function OrderPanel({
  state,
  totals,
  tableName,
  busy,
  can,
  loyaltyEnabled,
  openOrderCount,
  taxName,
  serviceChargePercent,
  cb,
  className,
}: {
  state: PosState;
  totals: PricingResult;
  tableName: string | null;
  busy: "draft" | "kitchen" | null;
  can: { discount: boolean; payment: boolean; edit: boolean };
  loyaltyEnabled: boolean;
  openOrderCount: number;
  taxName: string;
  serviceChargePercent: number;
  cb: PanelCallbacks;
  className?: string;
}) {
  const locked = state.paidTotal > 0;
  const due = Math.max(0, totals.total - state.paidTotal);
  // Paying sends an order to the kitchen. Only table service also offers "pay later":
  // dine-in guests usually settle the bill after the meal.
  const inKitchen = !!state.orderId && state.orderStatus !== "DRAFT";
  const payLater = state.type === "DINE_IN" && !inKitchen;
  const itemCount = state.lines.reduce((s, l) => s + l.quantity, 0);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!state.selectedKey) return;
    listRef.current?.querySelector(`[data-key="${state.selectedKey}"]`)?.scrollIntoView({ block: "nearest" });
  }, [state.selectedKey, state.lines.length]);

  const discountRows = [
    state.discount ? { label: `Discount${state.discount.type === "PERCENT" ? ` (${state.discount.value}%)` : ""}`, clear: () => cb.dispatch({ type: "set", patch: { discount: null } }) } : null,
    state.coupon ? { label: `Coupon ${state.coupon.code}`, clear: () => cb.dispatch({ type: "set", patch: { coupon: null } }) } : null,
    state.redeemPoints ? { label: `${state.redeemPoints} loyalty points`, clear: () => cb.dispatch({ type: "set", patch: { redeemPoints: 0 } }) } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <aside className={cn("flex h-full min-h-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{state.orderNumber ? state.orderNumber : "Current Order"}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {state.orderNumber ? `${statusOf(ORDER_STATUS, state.orderStatus).label}${locked ? ` · ${formatMoney(state.paidTotal)} paid` : ""}` : itemCount ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "New order"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {state.type === "DINE_IN" && tableName ? (
            <Badge tone="success" className="h-6">
              Table {tableName}
            </Badge>
          ) : state.type !== "DINE_IN" ? (
            <Badge tone="info" className="h-6">
              {TYPES.find((t) => t.value === state.type)?.label}
            </Badge>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Order options">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={cb.openOrders}>
                <ListOrdered /> Open & held orders
                {openOrderCount ? <span className="ml-auto text-xs text-muted">{openOrderCount}</span> : null}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={cb.newOrder}>
                <Plus /> New order <Kbd className="ml-auto">F4</Kbd>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" disabled={locked || state.lines.length === 0} onSelect={() => cb.dispatch({ type: "set", patch: { lines: [], selectedKey: null } })}>
                <Eraser /> Clear items
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Order type */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-4 rounded-lg border border-line bg-sunken p-0.5">
          {TYPES.map((t) => (
            <button suppressHydrationWarning
              key={t.value}
              type="button"
              disabled={locked}
              onClick={() => cb.dispatch({ type: "set", patch: { type: t.value } })}
              className={cn(
                "h-7 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed",
                state.type === t.value ? "bg-surface text-ink shadow-[0_1px_2px_rgb(20_18_48/0.08)]" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Context: table / delivery / online + customer */}
      <div className="space-y-2 px-4 pt-3">
        {state.type === "DINE_IN" ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 justify-start" onClick={cb.openTables} disabled={locked}>
              <Armchair /> {tableName ? `Table ${tableName}` : "Choose table"}
              <span className="ml-auto text-xs text-subtle">{tableName ? "Change" : ""}</span>
            </Button>
            <NativeSelect
              selectSize="sm"
              aria-label="Guests"
              className="w-[112px]"
              value={state.guests ?? ""}
              onChange={(e) => cb.dispatch({ type: "set", patch: { guests: e.target.value ? Number(e.target.value) : null } })}
            >
              <option value="">Guests</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "guest" : "guests"}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {state.type === "ONLINE" ? (
          <div className="flex gap-2">
            <NativeSelect
              selectSize="sm"
              className="w-[130px]"
              value={state.onlineSource}
              onChange={(e) => cb.dispatch({ type: "set", patch: { onlineSource: e.target.value as OnlineSource } })}
            >
              <option value="SWIGGY">Swiggy</option>
              <option value="ZOMATO">Zomato</option>
              <option value="WEBSITE">Website</option>
              <option value="OTHER">Other</option>
            </NativeSelect>
            <Input inputSize="sm" className="flex-1" placeholder="Platform order ID" value={state.externalRef} onChange={(e) => cb.dispatch({ type: "set", patch: { externalRef: e.target.value } })} />
          </div>
        ) : null}

        {state.customer ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-brand-600">
              <UserRound className="size-3.5" />
            </span>
            <button suppressHydrationWarning type="button" onClick={cb.openCustomer} className="min-w-0 flex-1 text-left" disabled={locked}>
              <span className="block truncate text-[13px] font-medium text-ink">{state.customer.name}</span>
              <span className="block text-2xs text-muted">
                {formatPhone(state.customer.phone)}
                {loyaltyEnabled ? ` · ${state.customer.loyaltyBalance} pts` : ""}
              </span>
            </button>
            {!locked ? (
              <Button variant="ghost" size="icon-xs" aria-label="Remove customer" onClick={() => cb.dispatch({ type: "set", patch: { customer: null, redeemPoints: 0 } })}>
                <X />
              </Button>
            ) : null}
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={cb.openCustomer} disabled={locked}>
            <UserPlus /> Add customer
            <span className="ml-auto text-xs text-subtle">{state.type === "DELIVERY" ? "Required" : "For loyalty & receipts"}</span>
          </Button>
        )}

        {state.type === "DELIVERY" ? (
          <Textarea
            className="min-h-[56px] text-[13px]"
            placeholder="Delivery address"
            value={state.deliveryAddress}
            onChange={(e) => cb.dispatch({ type: "set", patch: { deliveryAddress: e.target.value } })}
          />
        ) : null}
      </div>

      {/* Items */}
      <div className="mt-3 min-h-0 flex-1 border-t border-line">
        {state.lines.length === 0 ? (
          <EmptyState compact icon={<ShoppingBag />} title="No items yet" description="Tap a dish to add it, or search with /." className="h-full" />
        ) : (
          <ul ref={listRef} className="h-full space-y-1 overflow-y-auto px-2 py-2 scrollbar-thin">
            {state.lines.map((l) => (
              <OrderLine key={l.key} line={l} selected={state.selectedKey === l.key} locked={locked} dispatch={cb.dispatch} />
            ))}
          </ul>
        )}
      </div>

      {/* Adjustments */}
      <div className="border-t border-line px-4 pt-2.5">
        <div className="@container grid grid-cols-4 gap-1.5">
          <Chip icon={<NotebookPen />} active={!!state.notes} onClick={cb.openNote} disabled={locked}>
            Note
          </Chip>
          {can.discount ? (
            <Chip icon={<Percent />} active={!!state.discount} onClick={cb.openDiscount} disabled={locked || !state.lines.length}>
              Discount
            </Chip>
          ) : null}
          <Chip icon={<TicketPercent />} active={!!state.coupon} onClick={cb.openCoupon} disabled={locked || !state.lines.length}>
            Coupon
          </Chip>
          {loyaltyEnabled ? (
            <Chip icon={<Gift />} active={!!state.redeemPoints} onClick={cb.openPoints} disabled={locked || !state.customer || !state.lines.length}>
              Points
            </Chip>
          ) : null}
        </div>
        {state.notes ? <p className="mt-2 line-clamp-2 text-xs text-muted">“{state.notes}”</p> : null}
      </div>

      {/* Summary */}
      <div className="px-4 pt-2.5">
        <dl className="space-y-1 text-[12.5px]">
          <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
          {discountRows.length ? (
            <div className="flex items-center justify-between">
              <dt className="flex min-w-0 items-center gap-1 text-muted">
                <span className="truncate">{discountRows.map((d) => d.label).join(" + ")}</span>
                {!locked ? (
                  <button suppressHydrationWarning type="button" className="rounded p-0.5 text-subtle hover:text-danger" aria-label="Remove discounts" onClick={() => discountRows.forEach((d) => d.clear())}>
                    <X className="size-3" />
                  </button>
                ) : null}
              </dt>
              <dd className="tabular font-medium text-success-700">−{formatMoney(totals.discountTotal)}</dd>
            </div>
          ) : null}
          <Row label={`Tax (${totals.taxBreakdown.length === 1 ? totals.taxBreakdown[0]!.name : taxName})`} value={formatMoney(totals.taxTotal)} />
          {serviceChargePercent > 0 && state.type === "DINE_IN" ? <Row label={`Service charge (${serviceChargePercent}%)`} value={formatMoney(totals.serviceCharge)} /> : null}
          {totals.roundOff ? <Row label="Round off" value={`${totals.roundOff > 0 ? "+" : "−"}${formatMoney(Math.abs(totals.roundOff))}`} muted /> : null}
          {locked ? <Row label="Already paid" value={`−${formatMoney(state.paidTotal)}`} /> : null}
        </dl>
        <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-line-strong pt-2">
          <span className="text-sm font-semibold text-ink">{locked ? "Remaining" : "Total"}</span>
          <span className="tabular text-xl font-semibold text-ink">{formatMoney(due)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 p-4 pt-2.5">
        {can.payment ? (
          <Button size="lg" className="w-full justify-between font-semibold" onClick={cb.charge} disabled={!state.lines.length || busy !== null}>
            <span className="flex items-center gap-2">
              Charge {formatMoney(due)}
              <Kbd className="border-white/25 bg-white/15 text-white">F8</Kbd>
            </span>
            <ArrowRight />
          </Button>
        ) : null}
        {!locked ? (
          <div className={cn("grid gap-2", !inKitchen && payLater ? "grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]" : "grid-cols-1")}>
            {inKitchen || payLater ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={cb.sendKitchen}
                loading={busy === "kitchen"}
                disabled={!state.lines.length || busy !== null || !can.edit}
                title={inKitchen ? "Send item changes to the kitchen" : "Send to the kitchen now and settle the bill after the meal"}
              >
                <ChefHat />
                {inKitchen ? (
                  "Update kitchen order"
                ) : (
                  <span className="truncate">
                    Send to kitchen<span className="text-muted"> · pay later</span>
                  </span>
                )}
              </Button>
            ) : null}
            {!inKitchen ? (
              <Button variant="outline" size="sm" onClick={cb.saveDraft} loading={busy === "draft"} disabled={!state.lines.length || busy !== null || !can.edit}>
                <Save /> Save as draft
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", muted ? "text-subtle" : "font-medium text-ink")}>{value}</dd>
    </div>
  );
}

function Chip({ icon, children, active, onClick, disabled }: { icon: React.ReactNode; children: React.ReactNode; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button suppressHydrationWarning
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0 @max-[340px]:[&_svg]:hidden",
        active ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line text-ink-2 hover:border-line-strong hover:bg-canvas",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

const OrderLine = React.memo(function OrderLine({
  line: l,
  selected,
  locked,
  dispatch,
}: {
  line: CartLine;
  selected: boolean;
  locked: boolean;
  dispatch: React.Dispatch<PosAction>;
}) {
  const extras = [l.variantName, ...l.modifierNames].filter(Boolean).join(" · ");
  return (
    <li
      data-key={l.key}
      onClick={() => dispatch({ type: "select", key: l.key })}
      className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors", selected ? "bg-brand-50 ring-1 ring-brand-150" : "hover:bg-canvas")}
    >
      <ProductImage src={l.imageUrl} name={l.name} className="size-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-tight font-medium text-ink">{l.name}</p>
        <p className="truncate text-2xs text-muted">
          <span className="tabular">{formatMoney(l.unitPrice + l.modifiersTotal)}</span>
          {extras ? ` · ${extras}` : ""}
        </p>
        {l.notes ? <p className="truncate text-2xs text-warning-700">Note: {l.notes}</p> : null}
      </div>
      {locked ? (
        <span className="tabular text-xs text-muted">× {l.quantity}</span>
      ) : (
        <div onClick={(e) => e.stopPropagation()}>
          <QuantityStepper size="sm" value={l.quantity} onChange={(n) => dispatch({ type: "setQty", key: l.key, quantity: n })} />
        </div>
      )}
      <p className="tabular w-[64px] shrink-0 text-right text-[13px] font-semibold text-ink">{formatMoney((l.unitPrice + l.modifiersTotal) * l.quantity)}</p>
      {!locked ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${l.name}`}
          className="-mr-1 shrink-0 text-subtle hover:bg-danger-50 hover:text-danger-700"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: "remove", key: l.key });
          }}
        >
          <Trash />
        </Button>
      ) : null}
    </li>
  );
});

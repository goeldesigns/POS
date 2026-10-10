"use client";

import { ChevronUp, ListOrdered, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { Sheet, SheetContent, ConfirmDialog } from "@/components/ui/overlay";
import { useSession } from "@/components/shell/session-context";
import { formatMoney, formatRelative } from "@/lib/format";
import { ORDER_STATUS, ORDER_TYPE_LABEL } from "@/lib/labels";
import { checkoutAction, posRecordPaymentAction, saveOrderAction } from "@/server/actions/pos";
import type { PosBootstrap, PosOrder } from "@/server/services/pos";
import { CouponDialog, CustomerPicker, CustomizeDialog, DiscountDialog, NoteDialog, PointsDialog, TablePicker } from "./pos-dialogs";
import { OrderPanel } from "./order-panel";
import { PaymentDialog, type PaymentLine, type PaymentResult } from "./payment-dialog";
import { ProductGrid } from "./product-grid";
import { computeTotals, draftPayload, emptyState, posReducer, stateFromOrder, type CouponDef, type OrderType, type PosCustomer, type Product } from "./pos-store";

type DialogName = "customize" | "tables" | "customer" | "discount" | "coupon" | "points" | "note" | "orders" | "payment" | "mobileOrder" | "confirmNew" | null;

export function PosScreen({
  data,
  initialOrder,
  initialCoupon,
  initialTableId,
  initialCustomer = null,
}: {
  data: PosBootstrap;
  initialOrder: PosOrder | null;
  initialCoupon: CouponDef | null;
  initialTableId: string | null;
  initialCustomer?: PosCustomer | null;
}) {
  const router = useRouter();
  const session = useSession();
  const defaultType = data.settings.defaultOrderType as OrderType;
  const [state, dispatch] = React.useReducer(posReducer, undefined, () => {
    if (initialOrder) return stateFromOrder(initialOrder, data.products, initialCoupon);
    const s = { ...emptyState(defaultType), customer: initialCustomer };
    return initialTableId ? { ...s, type: "DINE_IN" as const, tableId: initialTableId } : s;
  });
  const [dialog, setDialog] = React.useState<DialogName>(null);
  const [customizing, setCustomizing] = React.useState<Product | null>(null);
  const [busy, setBusy] = React.useState<"draft" | "kitchen" | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const totals = React.useMemo(() => computeTotals(state, data.settings, data.loyalty.pointValue), [state, data.settings, data.loyalty.pointValue]);
  const cartQty = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of state.lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
    return m;
  }, [state.lines]);
  const tables = React.useMemo(() => data.floors.flatMap((f) => f.tables), [data.floors]);
  const tableName = tables.find((t) => t.id === state.tableId)?.name ?? null;
  const hasTables = tables.length > 0;
  const locked = state.paidTotal > 0;

  const can = {
    discount: session.can("pos.apply_discount"),
    payment: session.can("pos.process_payment"),
    edit: session.can("pos.create_order") || session.can("pos.edit_order"),
  };

  const pick = React.useCallback(
    (p: Product) => {
      if (locked) return toast.error("This order has a payment — items are locked");
      if (!p.isAvailable) return;
      if (p.variants.length > 0 || p.modifierGroups.length > 0) {
        setCustomizing(p);
        setDialog("customize");
        return;
      }
      dispatch({
        type: "add",
        line: {
          productId: p.id, variantId: null, modifierIds: [], quantity: 1, notes: null, name: p.name, variantName: null, modifierNames: [],
          unitPrice: p.price, modifiersTotal: 0, taxRate: p.taxRate, imageUrl: p.imageUrl, foodType: p.foodType,
        },
      });
    },
    [locked],
  );

  // Bumped on every new order so the menu search and category reset too.
  const [resetKey, setResetKey] = React.useState(0);
  const resetOrder = React.useCallback(() => {
    dispatch({ type: "reset", state: emptyState(defaultType) });
    setResetKey((k) => k + 1);
    setDialog(null);
    if (initialOrder || initialTableId || initialCustomer) router.replace("/app/pos");
    else router.refresh();
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [defaultType, initialOrder, initialTableId, initialCustomer, router]);

  const validate = (forPayment: boolean): boolean => {
    if (!state.lines.length) {
      toast.error("Add at least one item");
      return false;
    }
    if (state.type === "DINE_IN" && hasTables && !state.tableId && !forPayment) {
      toast.error("Choose a table for this dine-in order");
      setDialog("tables");
      return false;
    }
    if (state.type === "DELIVERY" && data.settings.requireCustomerForDelivery && !state.customer) {
      toast.error("Add the customer for delivery orders");
      setDialog("customer");
      return false;
    }
    return true;
  };

  const save = async (mode: "DRAFT" | "KITCHEN") => {
    if (!validate(false) || busy) return;
    setBusy(mode === "DRAFT" ? "draft" : "kitchen");
    const result = await saveOrderAction({ ...draftPayload(state), mode });
    setBusy(null);
    if (!result.ok) return toast.error(result.error);
    toast.success(mode === "DRAFT" ? `${result.data.orderNumber} saved as draft` : state.orderId && state.orderStatus !== "DRAFT" ? `${result.data.orderNumber} updated for the kitchen` : `${result.data.orderNumber} sent to kitchen · bill open`, {
      action: mode === "KITCHEN" ? { label: "Print KOT", onClick: () => window.open(`/print/kot/${result.data.id}`, "_blank", "width=420,height=720") } : undefined,
    });
    if (mode === "KITCHEN" && data.settings.autoPrintKot) window.open(`/print/kot/${result.data.id}`, "_blank", "width=420,height=720");
    resetOrder();
  };

  const charge = () => {
    if (!can.payment) return toast.error("You don't have permission to take payments");
    if (!validate(true)) return;
    setDialog("payment");
  };

  const confirmPayment = async (payments: PaymentLine[]): Promise<PaymentResult | null> => {
    if (locked && state.orderId) {
      const r = await posRecordPaymentAction({ orderId: state.orderId, payments });
      if (!r.ok) {
        toast.error(r.error);
        return null;
      }
      return { ...r.data, change: payments.reduce((s, p) => s + (p.method === "CASH" && p.receivedAmount ? p.receivedAmount - p.amount : 0), 0) };
    }
    const r = await checkoutAction({ ...draftPayload(state), payments });
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    if (data.settings.autoPrintReceipt) window.open(`/print/receipt/${r.data.id}`, "_blank", "width=420,height=720");
    return r.data;
  };

  // Keyboard workflow
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog && dialog !== "mobileOrder") return;
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if (e.key === "F2" || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (state.lines.length && !state.orderId) setDialog("confirmNew");
        else resetOrder();
      } else if (e.key === "F6") {
        e.preventDefault();
        // Pay-later only for table service; other orders reach the kitchen when paid.
        if (!locked && (state.type === "DINE_IN" || (state.orderId && state.orderStatus !== "DRAFT"))) void save("KITCHEN");
      } else if (e.key === "F7") {
        e.preventDefault();
        if (!locked && (!state.orderId || state.orderStatus === "DRAFT")) void save("DRAFT");
      } else if (e.key === "F8") {
        e.preventDefault();
        charge();
      } else if (!typing && state.selectedKey && !locked) {
        if (e.key === "+" || e.key === "=") dispatch({ type: "qty", key: state.selectedKey, delta: 1 });
        else if (e.key === "-" || e.key === "_") dispatch({ type: "qty", key: state.selectedKey, delta: -1 });
        else if (e.key === "Delete") dispatch({ type: "remove", key: state.selectedKey });
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const i = state.lines.findIndex((l) => l.key === state.selectedKey);
          const next = state.lines[Math.max(0, Math.min(state.lines.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
          if (next) dispatch({ type: "select", key: next.key });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, state, locked]);

  const panel = (
    <OrderPanel
      state={state}
      totals={totals}
      tableName={tableName}
      busy={busy}
      can={can}
      loyaltyEnabled={data.loyalty.isEnabled}
      openOrderCount={data.openOrders.length}
      taxName={data.settings.taxName}
      serviceChargePercent={data.settings.serviceChargePercent}
      className="h-full"
      cb={{
        dispatch,
        openTables: () => setDialog("tables"),
        openCustomer: () => setDialog("customer"),
        openDiscount: () => setDialog("discount"),
        openCoupon: () => setDialog("coupon"),
        openPoints: () => setDialog("points"),
        openNote: () => setDialog("note"),
        openOrders: () => setDialog("orders"),
        newOrder: () => (state.lines.length && !state.orderId ? setDialog("confirmNew") : resetOrder()),
        saveDraft: () => void save("DRAFT"),
        sendKitchen: () => void save("KITCHEN"),
        charge,
      }}
    />
  );

  const itemCount = state.lines.reduce((s, l) => s + l.quantity, 0);
  const due = Math.max(0, totals.total - state.paidTotal);

  return (
    <div className="grid h-[calc(100dvh-64px)] gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_392px]">
      <section className="min-h-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card max-lg:mb-16">
        <ProductGrid products={data.products} categories={data.categories} cartQty={cartQty} onPick={pick} searchRef={searchRef} resetKey={resetKey} />
      </section>

      <div className="hidden min-h-0 lg:block">{panel}</div>

      {/* Tablet / phone: sticky summary that opens the order as a bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3 shadow-pop lg:hidden">
        <Button size="lg" className="w-full justify-between" onClick={() => setDialog("mobileOrder")}>
          <span className="flex items-center gap-2">
            <ChevronUp /> Review order · {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span>{formatMoney(due)}</span>
        </Button>
      </div>
      <Sheet open={dialog === "mobileOrder"} onOpenChange={(o) => setDialog(o ? "mobileOrder" : null)}>
        <SheetContent side="bottom" title="Current order" className="h-[88dvh] lg:hidden">
          <div className="min-h-0 flex-1 p-2 [&_aside]:border-0 [&_aside]:shadow-none">{panel}</div>
        </SheetContent>
      </Sheet>

      <CustomizeDialog product={dialog === "customize" ? customizing : null} onClose={() => setDialog(null)} onAdd={(line) => dispatch({ type: "add", line })} />
      <TablePicker
        open={dialog === "tables"}
        onOpenChange={(o) => setDialog(o ? "tables" : null)}
        floors={data.floors}
        currentTableId={state.tableId}
        currentOrderId={state.orderId}
        onSelect={(tableId) => dispatch({ type: "set", patch: { tableId, type: "DINE_IN" } })}
        onOpenOrder={(orderId) => router.push(`/app/pos?order=${orderId}`)}
      />
      <CustomerPicker
        open={dialog === "customer"}
        onOpenChange={(o) => setDialog(o ? "customer" : null)}
        loyaltyEnabled={data.loyalty.isEnabled}
        onSelect={(customer) => dispatch({ type: "set", patch: { customer, redeemPoints: 0 } })}
      />
      <DiscountDialog
        open={dialog === "discount"}
        onOpenChange={(o) => setDialog(o ? "discount" : null)}
        subtotal={totals.subtotal}
        current={state.discount}
        onApply={(discount) => dispatch({ type: "set", patch: { discount } })}
      />
      <CouponDialog
        open={dialog === "coupon"}
        onOpenChange={(o) => setDialog(o ? "coupon" : null)}
        subtotal={totals.subtotal}
        current={state.coupon}
        onApply={(coupon) => dispatch({ type: "set", patch: { coupon } })}
      />
      <PointsDialog
        open={dialog === "points"}
        onOpenChange={(o) => setDialog(o ? "points" : null)}
        customer={state.customer}
        billMinor={totals.subtotal - totals.discountTotal + (state.redeemPoints * data.loyalty.pointValue)}
        loyalty={data.loyalty}
        current={state.redeemPoints}
        onApply={(redeemPoints) => dispatch({ type: "set", patch: { redeemPoints } })}
      />
      <NoteDialog open={dialog === "note"} onOpenChange={(o) => setDialog(o ? "note" : null)} value={state.notes} onSave={(notes) => dispatch({ type: "set", patch: { notes } })} />
      <PaymentDialog
        open={dialog === "payment"}
        onOpenChange={(o) => setDialog(o ? "payment" : null)}
        amountDue={due}
        title={`${state.orderNumber ?? "New order"} · ${ORDER_TYPE_LABEL[state.type]}${tableName ? ` · Table ${tableName}` : ""}`}
        accept={{ cash: data.settings.acceptCash, card: data.settings.acceptCard, upi: data.settings.acceptUpi }}
        upiId={data.settings.upiId}
        restaurantName={session.restaurant.name}
        customer={state.customer}
        onConfirm={confirmPayment}
        onDone={resetOrder}
      />
      <ConfirmDialog
        open={dialog === "confirmNew"}
        onOpenChange={(o) => setDialog(o ? "confirmNew" : null)}
        title="Start a new order?"
        description="The items in the current cart haven't been saved. Save it as a draft first if you need it later."
        confirmLabel="Discard & start new"
        onConfirm={resetOrder}
      />
      <Sheet open={dialog === "orders"} onOpenChange={(o) => setDialog(o ? "orders" : null)}>
        <SheetContent title="Open & held orders" description="Resume a draft, add items to a running table, or collect payment." width="sm">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
            {data.openOrders.length === 0 ? (
              <EmptyState icon={<ListOrdered />} title="No open orders" description="Drafts and unpaid orders appear here." />
            ) : (
              <ul className="space-y-2">
                {data.openOrders.map((o) => (
                  <li key={o.id}>
                    <button suppressHydrationWarning
                      type="button"
                      onClick={() => {
                        setDialog(null);
                        router.push(`/app/pos?order=${o.id}`);
                      }}
                      className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">{o.orderNumber}</span>
                        <StatusBadge dict={ORDER_STATUS} value={o.status} size="sm" />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="truncate">
                          {ORDER_TYPE_LABEL[o.type]}
                          {o.tableName ? ` · ${o.tableName}` : ""}
                          {o.customerName ? ` · ${o.customerName}` : ""} · {o.items} {o.items === 1 ? "item" : "items"}
                        </span>
                        <span className="tabular shrink-0 font-medium text-ink">{formatMoney(o.total - o.paidTotal)}</span>
                      </div>
                      <p className="mt-0.5 text-2xs text-subtle">
                        {formatRelative(o.createdAt)}
                        {o.paidTotal ? <Badge tone="info" size="sm" className="ml-2">Part paid</Badge> : null}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line p-3">
            <Button variant="outline" className="w-full" onClick={() => (state.lines.length && !state.orderId ? setDialog("confirmNew") : resetOrder())}>
              <Plus /> New order
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

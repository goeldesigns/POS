"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  ChefHat,
  CircleCheck,
  Copy,
  CreditCard,
  Ellipsis,
  Pencil,
  Printer,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, StatusBadge } from "@/components/ui/display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { Sheet, SheetContent } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatPhone, formatTime } from "@/lib/format";
import { ORDER_SOURCE_LABEL, ORDER_STATUS, ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from "@/lib/labels";
import { cn, pluralize } from "@/lib/utils";
import { duplicateOrderAction, updateOrderStatusAction } from "@/server/actions/orders";
import { recordPaymentAction } from "@/server/actions/pos";
import type { OrderDetail } from "@/server/services/orders";
import { CancelOrderDialog, RefundDialog } from "./order-dialogs";

type Detail = Omit<OrderDetail, "items"> & { items: (OrderDetail["items"][number] & { modifiers: { id: string; name: string; price: number }[] })[] };

const OPEN = ["DRAFT", "NEW", "PREPARING", "READY", "SERVED"];

export function OrderDrawer() {
  const { get, set } = useQueryParams();
  const orderId = get("order");
  const session = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const tz = session.restaurant.timezone;
  const [dialog, setDialog] = React.useState<"cancel" | "refund" | "pay" | null>(null);

  const { data: o, isLoading, error } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiFetch<Detail>(`/api/v1/orders/${orderId}`),
    enabled: !!orderId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["order", orderId] });
    router.refresh();
  };

  const status = useAction(updateOrderStatusAction, { success: (r) => `${r.orderNumber} → ${ORDER_STATUS[r.status]?.label ?? r.status}`, onSuccess: refresh });
  const duplicate = useAction(duplicateOrderAction, {
    success: (r) => `Draft ${r.orderNumber} created`,
    onSuccess: (r) => router.push(`/app/pos?order=${r.id}`),
  });

  const close = () => set({ order: null });
  const open = !!o && OPEN.includes(o.status);
  const due = o ? o.total - o.paidTotal : 0;
  const canRefund = !!o && o.paidTotal - o.refundedTotal > 0 && (session.can("orders.refund") || session.can("pos.refund"));
  const canCancel = open && (session.can("orders.cancel") || session.can("pos.void_order"));
  // Food progress; "SERVED" closes a paid order, or leaves an unpaid one open for the bill.
  const nextStatus = o?.status === "NEW" ? "PREPARING" : o?.status === "PREPARING" ? "READY" : o?.status === "READY" ? "SERVED" : null;

  return (
    <Sheet open={!!orderId} onOpenChange={(v) => !v && close()}>
      <SheetContent
        width="md"
        title={o ? o.orderNumber : "Order"}
        description={o ? `${ORDER_TYPE_LABEL[o.type]}${o.table ? ` · Table ${o.table.name}` : ""} · ${ORDER_SOURCE_LABEL[o.source]}${o.externalRef ? ` #${o.externalRef}` : ""} · ${formatDateTime(o.createdAt, tz)}` : undefined}
      >
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : error || !o ? (
          <EmptyState title="Order not found" description="It may have been removed or belongs to another restaurant." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <StatusBadge dict={ORDER_STATUS} value={o.status} />
              {PAYMENT_STATUS[o.paymentStatus]?.label !== ORDER_STATUS[o.status]?.label && !(o.status === "CANCELLED" && o.paymentStatus === "UNPAID") ? <StatusBadge dict={PAYMENT_STATUS} value={o.paymentStatus} /> : null}
              <div className="ml-auto flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => window.open(`/print/receipt/${o.id}`, "_blank", "width=420,height=720")}>
                  <Printer /> Receipt
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon-sm" aria-label="More actions">
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[200px]">
                    <DropdownMenuItem onSelect={() => window.open(`/print/kot/${o.id}`, "_blank", "width=420,height=720")}>
                      <ReceiptText /> Print KOT
                    </DropdownMenuItem>
                    {open && o.paidTotal === 0 && session.can("pos.edit_order") ? (
                      <DropdownMenuItem asChild>
                        <Link href={`/app/pos?order=${o.id}`}>
                          <Pencil /> Edit in POS
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {session.can("pos.create_order") || session.can("orders.create") ? (
                      <DropdownMenuItem onSelect={() => duplicate.execute({ orderId: o.id })}>
                        <Copy /> Reorder (new draft)
                      </DropdownMenuItem>
                    ) : null}
                    {canRefund || canCancel ? <DropdownMenuSeparator /> : null}
                    {canRefund ? (
                      <DropdownMenuItem tone="danger" onSelect={() => setDialog("refund")}>
                        <RotateCcw /> Refund
                      </DropdownMenuItem>
                    ) : null}
                    {canCancel ? (
                      <DropdownMenuItem tone="danger" onSelect={() => setDialog("cancel")}>
                        <Ban /> Cancel order
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
              {/* Primary next step */}
              {open ? (
                <div className="flex flex-wrap gap-2">
                  {due > 0 && session.can("pos.process_payment") ? (
                    <Button onClick={() => setDialog("pay")}>
                      <CreditCard /> Collect {formatMoney(due)}
                    </Button>
                  ) : null}
                  {nextStatus && (session.can("orders.edit") || session.can("pos.edit_order")) ? (
                    <Button variant={due > 0 ? "outline" : "primary"} loading={status.pending} onClick={() => status.execute({ orderId: o.id, status: nextStatus })}>
                      {nextStatus === "PREPARING" ? <ChefHat /> : nextStatus === "READY" ? <ShoppingBag /> : <CircleCheck />}
                      {nextStatus === "PREPARING" ? "Start preparing" : nextStatus === "READY" ? "Mark ready" : due > 0 ? "Mark served" : "Complete order"}
                    </Button>
                  ) : null}
                  {o.status === "SERVED" && due > 0 ? <p className="w-full text-xs text-muted">Food served — collect the bill to close this order.</p> : null}
                  {o.status === "DRAFT" ? (
                    <Button asChild variant="secondary">
                      <Link href={`/app/pos?order=${o.id}`}>Resume in POS</Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {o.cancelReason ? (
                <p className="rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700">Cancelled — {o.cancelReason}</p>
              ) : null}

              <section className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className="grid size-9 place-items-center rounded-full bg-sunken text-muted">
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {o.customer ? (
                    <>
                      <Link href={`/app/customers/${o.customer.id}`} className="text-[13px] font-medium text-ink hover:text-brand-600">
                        {o.customer.name}
                      </Link>
                      <p className="text-xs text-muted">{formatPhone(o.customer.phone)}{o.customer.email ? ` · ${o.customer.email}` : ""}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-medium text-ink">{o.customerName ?? "Walk-in customer"}</p>
                      <p className="text-xs text-muted">{o.customerPhone ? formatPhone(o.customerPhone) : "No customer attached"}</p>
                    </>
                  )}
                </div>
                <div className="text-right text-xs text-muted">
                  {o.guests ? <p>{pluralize(o.guests, "guest")}</p> : null}
                  {o.createdBy ? <p>by {o.createdBy.name}</p> : null}
                </div>
              </section>

              {o.deliveryAddress ? (
                <p className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-2">
                  <span className="font-medium">Deliver to:</span> {o.deliveryAddress}
                </p>
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Items</h3>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {o.items.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
                      <span className="tabular w-7 shrink-0 font-semibold text-ink">{i.quantity}×</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {i.name}
                          {i.variantName ? <span className="font-normal text-muted"> · {i.variantName}</span> : null}
                        </p>
                        {i.modifiers.length ? <p className="text-xs text-muted">{i.modifiers.map((m) => m.name).join(", ")}</p> : null}
                        {i.notes ? <p className="text-xs text-warning-700">Note: {i.notes}</p> : null}
                      </div>
                      <span className="tabular shrink-0 text-ink">{formatMoney((i.unitPrice + i.modifiersTotal) * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <dl className="space-y-1.5 text-[13px]">
                  <Line label="Subtotal" value={formatMoney(o.subtotal)} />
                  {o.discounts.map((d) => (
                    <Line key={d.id} label={d.reason ?? (d.source === "COUPON" ? `Coupon ${d.couponCode}` : "Discount")} value={`−${formatMoney(d.amount)}`} tone="success" />
                  ))}
                  {o.taxes.map((t) => (
                    <React.Fragment key={t.id}>
                      {session.restaurant.currency === "INR" && t.name.startsWith("GST") ? (
                        <>
                          <Line label={`CGST ${t.rate / 2}%`} value={formatMoney(Math.floor(t.amount / 2))} />
                          <Line label={`SGST ${t.rate / 2}%`} value={formatMoney(t.amount - Math.floor(t.amount / 2))} />
                        </>
                      ) : (
                        <Line label={t.name} value={formatMoney(t.amount)} />
                      )}
                    </React.Fragment>
                  ))}
                  {o.serviceCharge ? <Line label="Service charge" value={formatMoney(o.serviceCharge)} /> : null}
                  {o.roundOff ? <Line label="Round off" value={`${o.roundOff > 0 ? "+" : "−"}${formatMoney(Math.abs(o.roundOff))}`} /> : null}
                </dl>
                <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-line-strong pt-2">
                  <span className="text-sm font-semibold text-ink">Total</span>
                  <span className="tabular text-lg font-semibold text-ink">{formatMoney(o.total)}</span>
                </div>
                {o.loyaltyPointsEarned || o.loyaltyPointsRedeemed ? (
                  <p className="mt-1 text-xs text-muted">
                    {o.loyaltyPointsEarned ? `${o.loyaltyPointsEarned} points earned` : ""}
                    {o.loyaltyPointsEarned && o.loyaltyPointsRedeemed ? " · " : ""}
                    {o.loyaltyPointsRedeemed ? `${o.loyaltyPointsRedeemed} points redeemed` : ""}
                  </p>
                ) : null}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Payments</h3>
                {o.payments.length ? (
                  <ul className="space-y-1.5">
                    {o.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-[13px]">
                        <span className="flex items-center gap-2">
                          <Badge tone={p.kind === "REFUND" ? "danger" : "success"} size="sm">
                            {p.kind === "REFUND" ? "Refund" : PAYMENT_METHOD_LABEL[p.method]}
                          </Badge>
                          <span className="text-xs text-muted">
                            {formatTime(p.createdAt, tz)}
                            {p.reference ? ` · ${p.reference}` : ""}
                            {p.kind === "REFUND" ? ` · ${PAYMENT_METHOD_LABEL[p.method]}` : ""}
                            {p.changeAmount ? ` · change ${formatMoney(p.changeAmount)}` : ""}
                          </span>
                        </span>
                        <span className={cn("tabular font-medium", p.kind === "REFUND" ? "text-danger-700" : "text-ink")}>
                          {p.kind === "REFUND" ? "−" : ""}
                          {formatMoney(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">{o.status === "CANCELLED" ? "No payments taken" : `No payments yet · ${formatMoney(o.total)} due`}</p>
                )}
              </section>

              {o.notes ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Notes</h3>
                  <p className="text-[13px] text-ink-2">{o.notes}</p>
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Timeline</h3>
                <ol className="relative space-y-3 border-l border-line pl-4">
                  {o.events.map((e) => (
                    <li key={e.id} className="relative text-[13px]">
                      <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-brand-400" aria-hidden />
                      <p className="text-ink">{e.message}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(e.createdAt, tz)}
                        {e.actorName ? ` · ${e.actorName}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <CancelOrderDialog order={o} open={dialog === "cancel"} onOpenChange={(v) => setDialog(v ? "cancel" : null)} onDone={refresh} />
            <RefundDialog
              order={{ ...o, defaultMethod: o.payments.find((p) => p.kind === "PAYMENT")?.method, hasLoyalty: !!(o.loyaltyPointsEarned || o.loyaltyPointsRedeemed) }}
              open={dialog === "refund"}
              onOpenChange={(v) => setDialog(v ? "refund" : null)}
              onDone={refresh}
            />
            <PaymentDialog
              open={dialog === "pay"}
              onOpenChange={(v) => setDialog(v ? "pay" : null)}
              amountDue={due}
              title={`${o.orderNumber} · ${ORDER_TYPE_LABEL[o.type]}`}
              accept={{ cash: true, card: true, upi: true }}
              upiId={null}
              restaurantName={session.restaurant.name}
              customer={o.customer ? { name: o.customer.name, phone: o.customer.phone, email: o.customer.email } : null}
              onConfirm={async (payments) => {
                const r = await recordPaymentAction({ orderId: o.id, payments });
                if (!r.ok) {
                  toast.error(r.error);
                  return null;
                }
                return { ...r.data, change: payments.reduce((s, p) => s + (p.method === "CASH" && p.receivedAmount ? p.receivedAmount - p.amount : 0), 0) };
              }}
              doneLabel="Done"
              onDone={() => {
                setDialog(null);
                refresh();
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", tone === "success" ? "text-success-700" : "text-ink")}>{value}</dd>
    </div>
  );
}

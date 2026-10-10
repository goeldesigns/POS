"use client";

import { BellRing, ChefHat, CircleCheck, Clock, ExternalLink, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatElapsed } from "@/lib/format";
import { ORDER_SOURCE_LABEL, ORDER_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { updateOrderStatusAction } from "@/server/actions/orders";
import type { KitchenOrder } from "@/server/services/order-queries";

const COLUMNS = [
  { status: "NEW", title: "New", hint: "Waiting to start", tone: "bg-info", next: "PREPARING" as const, action: "Start preparing", icon: ChefHat },
  { status: "PREPARING", title: "Preparing", hint: "On the stove", tone: "bg-warning", next: "READY" as const, action: "Mark ready", icon: BellRing },
  { status: "READY", title: "Ready", hint: "Serve, then complete", tone: "bg-brand-500", next: "SERVED" as const, action: "Complete", icon: CircleCheck },
];

/**
 * Live kitchen display. Tickets show only what to cook — no prices or payment details.
 * Refreshes every 20 seconds.
 */
export function KitchenBoard({ orders }: { orders: KitchenOrder[] }) {
  const router = useRouter();
  const session = useSession();
  const { set } = useQueryParams();
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  const canEdit = session.can("orders.edit") || session.can("pos.edit_order");
  // Billing staff can open the full order; the kitchen never sees amounts.
  const canOpenOrder = session.can("pos.process_payment");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const advance = useAction(updateOrderStatusAction, {
    success: (r) => (r.status === "COMPLETED" ? `${r.orderNumber} completed` : r.status === "SERVED" ? `${r.orderNumber} served — bill still open` : `${r.orderNumber} updated`),
    onSuccess: () => setBusyId(null),
    onError: () => setBusyId(null),
  });

  React.useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      tick();
    }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {COLUMNS.map((col) => {
        const list = orders.filter((o) => o.status === col.status);
        return (
          <section key={col.status} className="flex min-h-[420px] flex-col rounded-[var(--radius-card)] border border-line bg-sunken/60">
            <header className="flex items-center gap-2 px-4 py-3">
              <span className={cn("size-2 rounded-full", col.tone)} aria-hidden />
              <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
              <span className="tabular rounded-full bg-surface px-2 text-xs font-medium text-muted ring-1 ring-line">{list.length}</span>
              <span className="ml-auto text-xs text-muted">{col.hint}</span>
            </header>
            <div className="flex-1 space-y-3 px-3 pb-3">
              {list.length === 0 ? (
                <EmptyState compact title="Nothing here" description={col.status === "NEW" ? "Paid orders and table orders appear here as soon as they're placed." : undefined} />
              ) : (
                list.map((o) => {
                  const mins = (Date.now() - new Date(o.placedAt).getTime()) / 60_000;
                  const late = col.status !== "READY" && mins > 25;
                  const hasAdded = o.items.some((i) => i.added);
                  return (
                    <article key={o.id} className={cn("rounded-xl border bg-surface shadow-card", late ? "border-danger-100" : "border-line")}>
                      <div className="px-3.5 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[15px] font-semibold text-ink">{o.tableName ? `Table ${o.tableName}` : ORDER_TYPE_LABEL[o.type]}</span>
                          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", late ? "text-danger-700" : "text-muted")}>
                            <Clock className="size-3.5" /> {formatElapsed(o.placedAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {canOpenOrder ? (
                            <button
                              suppressHydrationWarning
                              type="button"
                              onClick={() => set({ order: o.id })}
                              className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-brand-600"
                            >
                              {o.orderNumber} <ExternalLink className="size-3" />
                            </button>
                          ) : (
                            <span>{o.orderNumber}</span>
                          )}
                          {o.source !== "POS" ? <Badge size="sm" tone="warning">{ORDER_SOURCE_LABEL[o.source]}</Badge> : null}
                          {o.guests ? (
                            <span className="inline-flex items-center gap-0.5">
                              · <Users className="size-3" /> {o.guests}
                            </span>
                          ) : null}
                          {o.customerName && !o.tableName ? <span>· {o.customerName}</span> : null}
                          {hasAdded ? <Badge size="sm" tone="warning">Items added</Badge> : null}
                        </div>
                        <ul className="mt-2.5 space-y-1 border-t border-dashed border-line pt-2.5">
                          {o.items.map((i) => (
                            <li key={i.id} className={cn("text-[13px]", i.served && "text-subtle")}>
                              <span className={cn("font-semibold", i.served ? "text-subtle" : "text-ink")}>{i.quantity}×</span>{" "}
                              <span className={i.served ? "line-through decoration-line-strong" : "text-ink"}>{i.name}</span>
                              {i.variantName ? <span className="text-muted"> ({i.variantName})</span> : null}
                              {i.added ? (
                                <Badge size="sm" tone="warning" className="ml-1.5 align-middle">
                                  Added
                                </Badge>
                              ) : null}
                              {i.served ? <span className="ml-1.5 text-2xs">served</span> : null}
                              {i.modifiers.length ? <span className="block pl-5 text-xs text-muted">{i.modifiers.join(", ")}</span> : null}
                              {i.notes ? <span className="block pl-5 text-xs text-warning-700">↳ {i.notes}</span> : null}
                            </li>
                          ))}
                        </ul>
                        {o.notes ? <p className="mt-2 rounded-md bg-warning-50 px-2 py-1 text-xs text-warning-700">{o.notes}</p> : null}
                      </div>
                      {canEdit ? (
                        <div className="px-3.5 pt-2.5 pb-3">
                          <Button
                            size="sm"
                            variant={col.status === "READY" ? "primary" : "secondary"}
                            className="w-full"
                            loading={advance.pending && busyId === o.id}
                            onClick={() => {
                              setBusyId(o.id);
                              void advance.execute({ orderId: o.id, status: col.next });
                            }}
                          >
                            <col.icon />
                            {col.action}
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

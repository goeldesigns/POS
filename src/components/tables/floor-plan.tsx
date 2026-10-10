"use client";

import {
  ArrowLeftRight,
  CalendarClock,
  Clock,
  Ellipsis,
  GripVertical,
  Merge,
  Pencil,
  Plus,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Split,
  Trash,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { PillTabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { formatElapsed, formatMoney, formatTime } from "@/lib/format";
import { TABLE_STATUS } from "@/lib/labels";
import { cn, pluralize } from "@/lib/utils";
import { deleteTableAction, reorderTablesAction, setTableStatusAction, splitTableAction } from "@/server/actions/tables";
import type { FloorPlan as Plan, FloorTable } from "@/server/services/tables";
import { MergeDialog, SectionsDialog, TableFormDialog, TransferDialog } from "./table-dialogs";

const STRIPE: Record<string, string> = {
  AVAILABLE: "before:bg-success",
  OCCUPIED: "before:bg-brand-500",
  RESERVED: "before:bg-warning",
  CLEANING: "before:bg-info",
  BLOCKED: "before:bg-subtle",
};

const STATUS_ORDER = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "BLOCKED"] as const;

export function FloorPlan({ floors }: { floors: Plan }) {
  const session = useSession();
  const router = useRouter();
  const tz = session.restaurant.timezone;
  const [floor, setFloor] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [arrange, setArrange] = React.useState(false);
  const [dialog, setDialog] = React.useState<{ kind: "form" | "sections" | "transfer" | "merge" | "delete"; table: FloorTable | null } | null>(null);
  const [order, setOrder] = React.useState<Record<string, string[]>>({});
  const dragId = React.useRef<string | null>(null);
  const [, tick] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    setOrder(Object.fromEntries(floors.map((f) => [f.id, f.tables.map((t) => t.id)])));
  }, [floors]);
  React.useEffect(() => {
    const id = setInterval(() => {
      tick();
      router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  const status = useAction(setTableStatusAction, { success: "Table updated" });
  const split = useAction(splitTableAction, { success: "Tables split" });
  const del = useAction(deleteTableAction, { success: "Table deleted", onSuccess: () => setDialog(null) });
  const reorder = useAction(reorderTablesAction, { success: "Layout saved" });

  const all = floors.flatMap((f) => f.tables);
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, all.filter((t) => t.status === s).length]));
  const visibleFloors = floor === "all" ? floors : floors.filter((f) => f.id === floor);
  const can = {
    create: session.can("tables.create"),
    edit: session.can("tables.edit"),
    del: session.can("tables.delete"),
    assign: session.can("tables.assign_orders"),
    pos: session.can("pos.view"),
    newOrder: session.can("pos.create_order"),
  };

  const openTable = (t: FloorTable) => {
    if (arrange) return;
    if (t.mergedInto) return;
    if (t.openOrder) router.push(can.pos ? `/app/pos?order=${t.openOrder.id}` : `/app/orders?order=${t.openOrder.id}`);
    else if (can.newOrder && t.status !== "BLOCKED") router.push(`/app/pos?table=${t.id}`);
  };

  const onDrop = (floorId: string, targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const ids = [...(order[floorId] ?? [])];
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(targetId);
    if (fi < 0 || ti < 0) return;
    ids.splice(fi, 1);
    ids.splice(ti, 0, from);
    setOrder({ ...order, [floorId]: ids });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PillTabs
          items={[{ value: "all", label: "All sections", count: all.length }, ...floors.map((f) => ({ value: f.id, label: f.name, count: f.tables.length }))]}
          value={floor}
          onChange={setFloor}
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-2">
          {can.edit ? (
            arrange ? (
              <>
                <Button variant="outline" onClick={() => { setArrange(false); setOrder(Object.fromEntries(floors.map((f) => [f.id, f.tables.map((t) => t.id)]))); }}>Cancel</Button>
                <Button
                  loading={reorder.pending}
                  onClick={async () => {
                    const ids = floors.flatMap((f) => order[f.id] ?? []);
                    const r = await reorder.execute({ ids });
                    if (r.ok) setArrange(false);
                  }}
                >
                  Save layout
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setArrange(true)}>
                  <GripVertical /> Arrange
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: "sections", table: null })}>
                  <Settings2 /> Sections
                </Button>
              </>
            )
          ) : null}
          {can.create && !arrange ? (
            <Button onClick={() => setDialog({ kind: "form", table: null })}>
              <Plus /> Add table
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_ORDER.map((s) => (
          <button suppressHydrationWarning
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={cn(
              "inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
              statusFilter === s ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2 hover:border-line-strong",
            )}
          >
            <span className={cn("size-2 rounded-full", STRIPE[s]!.replace("before:", ""))} />
            {TABLE_STATUS[s]!.label}
            <span className="tabular text-muted">{counts[s]}</span>
          </button>
        ))}
        {arrange ? <span className="ml-2 text-xs text-brand-600">Drag tables to reorder them within a section, then save.</span> : null}
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No tables yet"
          description="Add your dining sections and tables to take dine-in orders by table."
          action={can.create ? <Button onClick={() => setDialog({ kind: "form", table: null })}><Plus /> Add table</Button> : null}
        />
      ) : (
        visibleFloors.map((f) => {
          const ids = order[f.id] ?? f.tables.map((t) => t.id);
          const tables = ids.map((id) => f.tables.find((t) => t.id === id)).filter((t): t is FloorTable => !!t).filter((t) => !statusFilter || t.status === statusFilter);
          if (!tables.length && statusFilter) return null;
          return (
            <section key={f.id}>
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                {f.name}
                <span className="font-normal text-muted">
                  {f.tables.filter((t) => t.status === "AVAILABLE").length} free of {f.tables.length}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] sm:gap-3">
                {tables.map((t) => (
                  <article
                    key={t.id}
                    draggable={arrange}
                    onDragStart={() => (dragId.current = t.id)}
                    onDragOver={(e) => arrange && e.preventDefault()}
                    onDrop={() => onDrop(f.id, t.id)}
                    className={cn(
                      "group relative flex min-h-[128px] flex-col overflow-hidden sm:min-h-[148px] rounded-[var(--radius-card)] border border-line bg-surface p-3.5 pl-4 shadow-card transition-[box-shadow,border-color] before:absolute before:inset-y-0 before:left-0 before:w-1",
                      STRIPE[t.status],
                      !arrange && (t.openOrder || (can.newOrder && t.status !== "BLOCKED")) && !t.mergedInto && "cursor-pointer hover:border-brand-200 hover:shadow-raised",
                      arrange && "cursor-grab border-dashed active:cursor-grabbing",
                      t.mergedInto && "opacity-70",
                    )}
                    onClick={() => openTable(t)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[17px] leading-tight font-semibold text-ink">{t.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Users className="size-3.5" /> {t.capacity} seats
                          {t.mergedTables.length ? <span className="text-brand-600"> · + {t.mergedTables.map((m) => m.name).join(", ")}</span> : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {arrange ? (
                          <GripVertical className="size-4 text-subtle" />
                        ) : (
                          <TableMenu
                            table={t}
                            can={can}
                            onAction={(kind) => setDialog({ kind, table: t })}
                            onStatus={(s) => status.execute({ tableId: t.id, status: s as never })}
                            onSplit={() => split.execute({ tableId: t.id })}
                          />
                        )}
                      </div>
                    </div>

                    <div className="mt-2">
                      {t.mergedInto ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                          <Merge className="size-3.5" /> Merged with {t.mergedInto.name}
                        </span>
                      ) : (
                        <StatusBadge dict={TABLE_STATUS} value={t.status} size="sm" />
                      )}
                    </div>

                    <div className="mt-auto pt-3">
                      {t.openOrder ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-medium text-ink-2">
                              {t.openOrder.orderNumber}
                              {t.openOrder.status === "SERVED" ? (
                                <Badge size="sm" tone="warning">
                                  Bill due
                                </Badge>
                              ) : null}
                            </span>
                            <span className="tabular text-[15px] font-semibold text-ink">{formatMoney(t.openOrder.total)}</span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-x-2 text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3.5" /> {formatElapsed(t.occupiedSince ?? t.openOrder.since)}
                            </span>
                            <span>
                              {t.openOrder.guests ? `${pluralize(t.openOrder.guests, "guest")} · ` : ""}
                              {pluralize(t.openOrder.items, "item")}
                            </span>
                          </div>
                        </div>
                      ) : t.reservation ? (
                        <p className="flex items-center gap-1.5 text-xs text-warning-700">
                          <CalendarClock className="size-3.5" />
                          {formatTime(t.reservation.startsAt, tz)} · {t.reservation.customerName} ({t.reservation.partySize})
                        </p>
                      ) : t.status === "OCCUPIED" && t.occupiedSince ? (
                        <p className="text-xs text-muted">Seated {formatElapsed(t.occupiedSince)} ago · no open bill</p>
                      ) : t.notes ? (
                        <p className="line-clamp-2 text-xs text-muted">{t.notes}</p>
                      ) : t.status === "AVAILABLE" && can.newOrder ? (
                        <p className="text-xs font-medium text-brand-500 opacity-0 transition-opacity group-hover:opacity-100">Start order →</p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}

      <TableFormDialog open={dialog?.kind === "form"} onOpenChange={(o) => !o && setDialog(null)} floors={floors} table={dialog?.table ?? null} defaultFloorId={floor !== "all" ? floor : undefined} />
      <SectionsDialog open={dialog?.kind === "sections"} onOpenChange={(o) => !o && setDialog(null)} floors={floors} canDelete={can.del} />
      <TransferDialog open={dialog?.kind === "transfer"} onOpenChange={(o) => !o && setDialog(null)} table={dialog?.table ?? null} floors={floors} />
      <MergeDialog open={dialog?.kind === "merge"} onOpenChange={(o) => !o && setDialog(null)} table={dialog?.table ?? null} floors={floors} />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${dialog?.table?.name ?? "table"}?`}
        description="Past orders keep their history. Tables with an open order can't be deleted."
        confirmLabel="Delete table"
        loading={del.pending}
        onConfirm={() => del.execute({ id: dialog!.table!.id })}
      />
    </div>
  );
}

function TableMenu({
  table: t,
  can,
  onAction,
  onStatus,
  onSplit,
}: {
  table: FloorTable;
  can: { create: boolean; edit: boolean; del: boolean; assign: boolean; pos: boolean; newOrder: boolean };
  onAction: (kind: "form" | "transfer" | "merge" | "delete") => void;
  onStatus: (s: string) => void;
  onSplit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`${t.name} options`} className="opacity-60 group-hover:opacity-100 data-[state=open]:opacity-100">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[210px]">
        {t.openOrder ? (
          <>
            {can.pos ? (
              <DropdownMenuItem asChild>
                <Link href={`/app/pos?order=${t.openOrder.id}`}>
                  <ShoppingBag /> Open in POS
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href={`/app/orders?order=${t.openOrder.id}`}>
                <ReceiptText /> Order details
              </Link>
            </DropdownMenuItem>
            {can.assign ? (
              <DropdownMenuItem onSelect={() => onAction("transfer")}>
                <ArrowLeftRight /> Move to another table
              </DropdownMenuItem>
            ) : null}
          </>
        ) : can.newOrder && t.status !== "BLOCKED" && !t.mergedInto ? (
          <DropdownMenuItem asChild>
            <Link href={`/app/pos?table=${t.id}`}>
              <Plus /> New order
            </Link>
          </DropdownMenuItem>
        ) : null}
        {can.assign && !t.mergedInto ? (
          t.mergedTables.length ? (
            <DropdownMenuItem onSelect={onSplit}>
              <Split /> Split merged tables
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onAction("merge")}>
              <Merge /> Merge tables
            </DropdownMenuItem>
          )
        ) : null}
        {can.edit ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Set status</DropdownMenuLabel>
            {STATUS_ORDER.filter((s) => s !== t.status).map((s) => (
              <DropdownMenuItem key={s} disabled={!!t.openOrder && s !== "OCCUPIED"} onSelect={() => onStatus(s)}>
                <span className={cn("ml-0.5 size-2 rounded-full", STRIPE[s]!.replace("before:", ""))} /> Mark {TABLE_STATUS[s]!.label.toLowerCase()}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction("form")}>
              <Pencil /> Edit table
            </DropdownMenuItem>
          </>
        ) : null}
        {can.del ? (
          <DropdownMenuItem tone="danger" disabled={!!t.openOrder} onSelect={() => onAction("delete")}>
            <Trash /> Delete table
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

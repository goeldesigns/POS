"use client";

import { ScrollText } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Sheet, SheetContent } from "@/components/ui/overlay";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import type { AuditRow } from "@/server/services/platform";

function actionTone(action: string): Tone {
  if (/(deleted|archived|suspended|removed|disabled|cancel|refund|void)/.test(action)) return "danger";
  if (/(created|activated|restored|enabled|signup)/.test(action)) return "success";
  if (/(login|logout)/.test(action)) return "info";
  if (/(permissions|role|modules|subscription|plan)/.test(action)) return "brand";
  return "neutral";
}

export function AuditTable({
  rows,
  total,
  page,
  pageSize,
  showRestaurant = true,
  filtered,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  showRestaurant?: boolean;
  filtered?: boolean;
}) {
  const [open, setOpen] = React.useState<AuditRow | null>(null);
  const columns: Column<AuditRow>[] = [
    {
      key: "createdAt",
      header: "When",
      sortable: true,
      cell: (r) => (
        <span className="whitespace-nowrap text-ink-2" title={formatDateTime(r.createdAt, PLATFORM_TZ)}>
          {formatDateTime(r.createdAt, PLATFORM_TZ)}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      cell: (r) => (
        <div className="flex min-w-[150px] items-center gap-2.5">
          <Avatar name={r.actorName ?? "System"} size="xs" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium text-ink">{r.actorName ?? "System"}</p>
            <p className="truncate text-2xs text-muted">{r.actorRole ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (r) => (
        <Badge size="sm" tone={actionTone(r.action)} className="font-mono text-[11px]">
          {r.action}
        </Badge>
      ),
    },
    { key: "summary", header: "Details", cell: (r) => <p className="line-clamp-2 max-w-[520px] min-w-[240px] text-ink-2">{r.summary}</p> },
    ...(showRestaurant
      ? [
          {
            key: "restaurant",
            header: "Restaurant",
            hideBelow: "lg" as const,
            cell: (r: AuditRow) =>
              r.restaurant ? (
                <Link href={`/super-admin/restaurants/${r.restaurant.id}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-ink-2 hover:text-brand-600">
                  {r.restaurant.name}
                </Link>
              ) : (
                <span className="text-subtle">Platform</span>
              ),
          },
        ]
      : []),
    {
      key: "scope",
      header: "Scope",
      hideBelow: "xl",
      cell: (r) => <span className="text-xs text-muted">{r.scope === "PLATFORM" ? "Console" : "Restaurant"}</span>,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={setOpen}
        selectedId={open?.id}
        dense
        empty={
          <EmptyState
            icon={<ScrollText />}
            title={filtered ? "No activity matches" : "No activity yet"}
            description={filtered ? "Try a wider date range or a different filter." : "Sign-ins, setting changes and other sensitive actions appear here."}
          />
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open ? (
          <SheetContent title="Audit entry" description={formatDateTime(open.createdAt, PLATFORM_TZ)} width="md">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
              <p className="text-[14px] leading-relaxed text-ink">{open.summary}</p>
              <dl className="divide-y divide-line rounded-xl border border-line text-[13px]">
                {[
                  ["Action", <code key="a" className="font-mono text-xs">{open.action}</code>],
                  ["Actor", `${open.actorName ?? "System"}${open.actorRole ? ` · ${open.actorRole}` : ""}`],
                  ["Scope", open.scope === "PLATFORM" ? "Platform console" : "Restaurant workspace"],
                  ["Restaurant", open.restaurant?.name ?? "—"],
                  ["Record", `${open.entity}${open.entityId ? ` · ${open.entityId}` : ""}`],
                  ["IP address", open.ipAddress ?? "—"],
                  ["Device", open.userAgent ?? "—"],
                  ["Time", `${formatDateTime(open.createdAt, PLATFORM_TZ)} (${formatRelative(open.createdAt)})`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-3.5 py-2.5">
                    <dt className="text-muted">{label}</dt>
                    <dd className="break-words text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {open.metadata != null ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">Metadata</p>
                  <pre className="overflow-x-auto rounded-xl bg-night p-3.5 font-mono text-xs leading-relaxed text-white/85 scrollbar-thin">
                    {JSON.stringify(open.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}

"use client";

import { Archive, ArchiveRestore, Building, CreditCard, Ellipsis, Eye, Pause, Pencil, Play, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDate, formatNumber, formatPhone, formatRelative } from "@/lib/format";
import { RESTAURANT_STATUS, SUBSCRIPTION_STATUS } from "@/lib/labels";
import { initials } from "@/lib/utils";
import type { AdminRestaurantRow } from "@/server/services/platform";
import { RestaurantStatusDialogs, type StatusChange, type StatusTarget } from "./restaurant-status";

export function RestaurantsTable({
  rows,
  total,
  page,
  pageSize,
  filtered,
}: {
  rows: AdminRestaurantRow[];
  total: number;
  page: number;
  pageSize: number;
  filtered: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<{ target: StatusTarget; change: StatusChange } | null>(null);

  const columns: Column<AdminRestaurantRow>[] = [
    {
      key: "name",
      header: "Restaurant",
      sortable: true,
      cell: (r) => (
        <div className="flex min-w-[170px] items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-600 ring-1 ring-brand-100">
            {initials(r.name)}
          </span>
          <div className="min-w-0">
            <Link href={`/super-admin/restaurants/${r.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:text-brand-600">
              {r.name}
            </Link>
            <p className="truncate text-xs text-muted">{r.city ?? r.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (r) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate text-ink">{r.ownerName}</p>
          <p className="truncate text-xs text-muted">{r.email}</p>
          <p className="truncate text-xs text-muted tabular 2xl:hidden">{formatPhone(r.phone)}</p>
        </div>
      ),
    },
    { key: "phone", header: "Phone", hideBelow: "2xl", cell: (r) => <span className="tabular whitespace-nowrap text-ink-2">{formatPhone(r.phone)}</span> },
    {
      key: "plan",
      header: "Plan",
      cell: (r) =>
        r.plan ? (
          <div className="flex flex-col items-start gap-1">
            <span className="font-medium whitespace-nowrap text-ink">{r.plan}</span>
            {r.subscriptionStatus && r.subscriptionStatus !== "ACTIVE" ? (
              <StatusBadge dict={SUBSCRIPTION_STATUS} value={r.subscriptionStatus} size="sm" />
            ) : null}
          </div>
        ) : (
          <span className="text-subtle">No plan</span>
        ),
    },
    { key: "users", header: "Users", sortable: true, align: "right", hideBelow: "md", cell: (r) => formatNumber(r.users) },
    { key: "orders", header: "Orders", sortable: true, align: "right", hideBelow: "md", cell: (r) => formatNumber(r.orders) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge dict={RESTAURANT_STATUS} value={r.status} size="sm" /> },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      hideBelow: "lg",
      cell: (r) => <span className="whitespace-nowrap text-ink-2">{formatDate(r.createdAt, PLATFORM_TZ)}</span>,
    },
    {
      key: "lastActiveAt",
      header: "Last active",
      sortable: true,
      hideBelow: "lg",
      cell: (r) =>
        r.lastActiveAt ? (
          <span className="whitespace-nowrap text-ink-2" title={formatDate(r.lastActiveAt, PLATFORM_TZ)}>
            {formatRelative(r.lastActiveAt)}
          </span>
        ) : (
          <span className="text-subtle">Never</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`${r.name} actions`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[210px]">
              <DropdownMenuItem asChild>
                <Link href={`/super-admin/restaurants/${r.id}`}>
                  <Eye /> View details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/super-admin/restaurants/${r.id}?tab=settings`}>
                  <Pencil /> Edit details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/super-admin/restaurants/${r.id}?tab=users`}>
                  <Users /> Manage users
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/super-admin/restaurants/${r.id}?tab=subscription`}>
                  <CreditCard /> Change plan
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {r.status === "ACTIVE" ? (
                <DropdownMenuItem onSelect={() => setPending({ target: r, change: "suspend" })}>
                  <Pause /> Suspend
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setPending({ target: r, change: "activate" })}>
                  {r.status === "ARCHIVED" ? <ArchiveRestore /> : <Play />} {r.status === "ARCHIVED" ? "Restore" : "Re-activate"}
                </DropdownMenuItem>
              )}
              {r.status !== "ARCHIVED" ? (
                <DropdownMenuItem tone="danger" onSelect={() => setPending({ target: r, change: "archive" })}>
                  <Archive /> Archive
                </DropdownMenuItem>
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
        onRowClick={(r) => router.push(`/super-admin/restaurants/${r.id}`)}
        empty={
          <EmptyState
            icon={<Building />}
            title={filtered ? "No restaurants match" : "No restaurants yet"}
            description={filtered ? "Try another name, owner, phone number or filter." : "Create the first restaurant to get started."}
            action={
              filtered ? undefined : (
                <Button asChild>
                  <Link href="/super-admin/restaurants/new">
                    <Plus /> Add restaurant
                  </Link>
                </Button>
              )
            }
          />
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <RestaurantStatusDialogs target={pending?.target ?? null} change={pending?.change ?? null} onClose={() => setPending(null)} />
    </>
  );
}

export function PlanBadge({ name }: { name: string | null }) {
  if (!name) return <Badge size="sm">No plan</Badge>;
  return (
    <Badge size="sm" tone="brand">
      {name}
    </Badge>
  );
}


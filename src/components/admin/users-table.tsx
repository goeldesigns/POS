"use client";

import { Ban, CircleCheck, Ellipsis, ExternalLink, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { setUserStatusAction } from "@/server/actions/platform";
import type { PlatformUserRow } from "@/server/services/platform";
import { AddUserDialog } from "./members";

export function AddPlatformUserButton({ restaurants }: { restaurants: { id: string; name: string; city: string | null }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Add user
      </Button>
      <AddUserDialog open={open} onOpenChange={setOpen} restaurants={restaurants} />
    </>
  );
}

export function UsersTable({
  rows,
  total,
  page,
  pageSize,
  filtered,
  currentUserId,
}: {
  rows: PlatformUserRow[];
  total: number;
  page: number;
  pageSize: number;
  filtered: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [target, setTarget] = React.useState<{ user: PlatformUserRow; status: "ACTIVE" | "DISABLED" } | null>(null);
  const run = useAction(setUserStatusAction, {
    success: target?.status === "DISABLED" ? "Sign-in disabled — they were signed out everywhere" : "Sign-in re-enabled",
    onSuccess: () => {
      setTarget(null);
      router.refresh();
    },
  });

  const columns: Column<PlatformUserRow>[] = [
    {
      key: "name",
      header: "User",
      sortable: true,
      cell: (u) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">
              {u.name}
              {u.id === currentUserId ? <span className="ml-1.5 text-xs font-normal text-muted">(you)</span> : null}
            </p>
            <p className="truncate text-xs text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "access",
      header: "Access",
      cell: (u) =>
        u.platformRole ? (
          <Badge tone="brand" size="sm">
            {u.platformRole === "SUPER_ADMIN" ? "Super Admin" : "Support"}
          </Badge>
        ) : u.memberships.length ? (
          <div className="flex max-w-[360px] flex-wrap gap-1">
            {u.memberships.slice(0, 3).map((m) => (
              <Link
                key={m.id}
                href={`/super-admin/restaurants/${m.restaurantId}?tab=users`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 text-xs text-ink-2 hover:bg-line"
                title={`${m.role} at ${m.restaurantName}${m.status !== "ACTIVE" ? " (suspended)" : ""}`}
              >
                <span className={m.status !== "ACTIVE" || m.restaurantStatus !== "ACTIVE" ? "text-subtle line-through" : ""}>{m.restaurantName}</span>
                <span className="text-muted">· {m.role}</span>
              </Link>
            ))}
            {u.memberships.length > 3 ? <span className="text-xs text-muted">+{u.memberships.length - 3} more</span> : null}
          </div>
        ) : (
          <span className="text-xs text-subtle">No restaurant access</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) =>
        u.status === "ACTIVE" ? (
          <Badge tone="success" size="sm" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="danger" size="sm" dot>
            Disabled
          </Badge>
        ),
    },
    {
      key: "lastLoginAt",
      header: "Last sign-in",
      sortable: true,
      hideBelow: "md",
      cell: (u) =>
        u.lastLoginAt ? (
          <span className="whitespace-nowrap text-ink-2" title={formatDateTime(u.lastLoginAt, PLATFORM_TZ)}>
            {formatRelative(u.lastLoginAt)}
          </span>
        ) : (
          <span className="text-subtle">Never</span>
        ),
    },
    { key: "createdAt", header: "Created", sortable: true, hideBelow: "lg", cell: (u) => <span className="whitespace-nowrap text-ink-2">{formatDate(u.createdAt, PLATFORM_TZ)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (u) =>
        u.platformRole ? null : (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`${u.name} actions`}>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[230px]">
                {u.memberships.length ? (
                  <>
                    <DropdownMenuLabel>Manage in restaurant</DropdownMenuLabel>
                    {u.memberships.map((m) => (
                      <DropdownMenuItem key={m.id} asChild>
                        <Link href={`/super-admin/restaurants/${m.restaurantId}?tab=users`}>
                          <ExternalLink /> {m.restaurantName}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {u.status === "ACTIVE" ? (
                  <DropdownMenuItem tone="danger" onSelect={() => setTarget({ user: u, status: "DISABLED" })}>
                    <Ban /> Disable sign-in
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setTarget({ user: u, status: "ACTIVE" })}>
                    <CircleCheck /> Re-enable sign-in
                  </DropdownMenuItem>
                )}
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
        getRowId={(u) => u.id}
        onRowClick={(u) => (u.memberships[0] ? router.push(`/super-admin/restaurants/${u.memberships[0].restaurantId}?tab=users`) : undefined)}
        empty={<EmptyState icon={<UserRound />} title={filtered ? "No users match" : "No users yet"} description={filtered ? "Try a different name, email or filter." : undefined} />}
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        tone={target?.status === "DISABLED" ? "danger" : "primary"}
        title={target?.status === "DISABLED" ? `Disable sign-in for ${target.user.name}?` : `Re-enable sign-in for ${target?.user.name}?`}
        description={
          target?.status === "DISABLED"
            ? `They're signed out of every restaurant immediately${target.user.memberships.length > 1 ? ` (${target.user.memberships.length} restaurants)` : ""} and can't sign in until you re-enable them. Their roles are kept.`
            : "They can sign in again with their existing password, roles and permissions."
        }
        confirmLabel={target?.status === "DISABLED" ? "Disable sign-in" : "Re-enable"}
        loading={run.pending}
        onConfirm={() => target && run.execute({ userId: target.user.id, status: target.status })}
      />
    </>
  );
}

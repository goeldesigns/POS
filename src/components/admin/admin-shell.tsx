"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronDown, LogOut, Menu, Search, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { SidebarNav, useSidebarState } from "@/components/shell/sidebar";
import { Avatar } from "@/components/ui/display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { adminLogoutAction } from "@/server/actions/auth";

export interface AdminUser {
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

/**
 * Platform console chrome: a dark sidebar so admins never confuse it with a
 * restaurant workspace, and a quiet white header with restaurant search.
 */
export function AdminShell({ user, nav, environment, children }: { user: AdminUser; nav: NavItem[]; environment: string; children: React.ReactNode }) {
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebarState();

  const sidebarBody = (isCollapsed: boolean, onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center", isCollapsed ? "justify-center" : "px-4")}>
        <Link href="/super-admin/dashboard" onClick={onNavigate} className="min-w-0">
          {isCollapsed ? <Logo inverted subtitle={null} className="[&>span:last-child]:hidden" /> : <Logo inverted subtitle="Platform console" />}
        </Link>
      </div>
      {!isCollapsed ? (
        <p className="px-7 pt-2 pb-2 text-2xs font-semibold tracking-[0.08em] text-white/35 uppercase">Manage</p>
      ) : null}
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin", isCollapsed ? "px-2.5" : "px-3")}>
        <SidebarNav items={nav} collapsed={isCollapsed} tone="dark" onNavigate={onNavigate} />
      </div>
      {!isCollapsed ? (
        <div className="shrink-0 px-3 pb-4">
          <div className="rounded-xl bg-night-2 p-3.5 ring-1 ring-white/[0.06]">
            <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-white/50 uppercase">
              <ShieldCheck className="size-3.5 text-brand-300" /> {user.role}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/70">
              Changes here apply to every restaurant on the platform and are recorded in the audit log.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 bg-night transition-[width] duration-200 lg:block",
          collapsed ? "w-[72px]" : "w-[240px]",
        )}
      >
        {sidebarBody(collapsed)}
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(22_21_42/0.4)] data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[264px] bg-night shadow-pop outline-none data-[state=open]:animate-slide-in-left lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Platform console navigation</DialogPrimitive.Description>
            {sidebarBody(false, () => setMobileOpen(false))}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5">
          <button
            suppressHydrationWarning
            type="button"
            onClick={toggle}
            aria-label="Toggle navigation"
            className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken"
          >
            <Menu className="size-5" />
          </button>
          <RestaurantSearch />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "hidden rounded-md px-2 py-1 text-2xs font-semibold tracking-wide uppercase sm:inline-block",
                environment === "Production" ? "bg-danger-50 text-danger-700" : "bg-warning-50 text-warning-700",
              )}
              title="Environment"
            >
              {environment}
            </span>
            <div className="hidden h-8 w-px bg-line sm:block" />
            <AdminMenu user={user} />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function RestaurantSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  return (
    <form
      role="search"
      className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 shadow-card focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-100 sm:max-w-[420px]"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/super-admin/restaurants?q=${encodeURIComponent(term)}` : "/super-admin/restaurants");
      }}
    >
      <Search className="size-4 shrink-0 text-subtle" />
      <input
        suppressHydrationWarning
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a restaurant by name, owner, phone or city"
        aria-label="Find a restaurant"
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-subtle"
      />
    </form>
  );
}

function AdminMenu({ user }: { user: AdminUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 text-left outline-none hover:bg-sunken data-[state=open]:bg-sunken">
        <Avatar name={user.name} src={user.avatarUrl} />
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block max-w-[160px] truncate text-[13px] font-semibold text-ink">{user.name}</span>
          <span className="block text-2xs text-muted">{user.role}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]">
        <div className="px-2.5 py-2">
          <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/super-admin/profile">
            <UserRound />
            My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={() => void adminLogoutAction()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

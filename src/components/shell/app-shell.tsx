"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeftRight, Check, ChevronDown, CircleQuestionMark, Keyboard, LogOut, Megaphone, Menu, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Avatar, Kbd } from "@/components/ui/display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { BRAND } from "@/config/brand";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { logoutAction, selectRestaurantAction } from "@/server/actions/auth";
import type { PickerRestaurant } from "@/components/auth/restaurant-picker";
import { CommandMenu } from "./command-menu";
import { NotificationBell } from "./notifications";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { SidebarNav, useSidebarState } from "./sidebar";
import { useSession } from "./session-context";
import { LiveClock } from "./live-clock";

function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function AppShell({
  nav,
  restaurants,
  planCard,
  banner,
  children,
}: {
  nav: NavItem[];
  restaurants: PickerRestaurant[];
  planCard?: { plan: string; detail: string; usage?: string } | null;
  /** Platform-wide announcement set by the Super Admin. */
  banner?: string | null;
  children: React.ReactNode;
}) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // The POS needs every pixel on laptops and landscape tablets.
  const narrow = useMediaQuery("(max-width: 1279px)");
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebarState(narrow && pathname.startsWith("/app/pos"));
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      } else if (e.key === "?" && !typing) {
        setShortcutsOpen(true);
      } else if (e.key === "F2" && !window.location.pathname.startsWith("/app/pos") && session.can("pos.view")) {
        e.preventDefault();
        router.push("/app/pos");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, session]);

  const sidebarBody = (isCollapsed: boolean, onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center", isCollapsed ? "justify-center" : "px-4")}>
        <Link href="/app" onClick={onNavigate} className="min-w-0">
          {isCollapsed ? <Logo subtitle={null} className="[&>span:last-child]:hidden" /> : <Logo subtitle={session.restaurant.name} />}
        </Link>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin", isCollapsed ? "px-2.5" : "px-3")}>
        <SidebarNav items={nav} collapsed={isCollapsed} onNavigate={onNavigate} />
      </div>
      {!isCollapsed ? (
        <div className="shrink-0 space-y-3 px-3 pb-4">
          {planCard ? (
            <Link
              href="/app/settings/subscription"
              onClick={onNavigate}
              className="block rounded-xl border border-brand-150 bg-brand-50 p-3.5 transition-colors hover:border-brand-200"
            >
              <p className="text-2xs font-semibold tracking-wide text-brand-600 uppercase">{planCard.plan} plan</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{planCard.detail}</p>
              {planCard.usage ? <p className="mt-1.5 text-2xs text-muted">{planCard.usage}</p> : null}
            </Link>
          ) : null}
          <a href={`mailto:${BRAND.supportEmail}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-sunken hover:text-ink">
            <CircleQuestionMark className="size-4" />
            <span className="min-w-0">
              <span className="block font-medium text-ink-2">Need help?</span>
              <span className="block truncate">{BRAND.supportEmail}</span>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block no-print",
          collapsed ? "w-[72px]" : "w-[236px]",
        )}
      >
        {sidebarBody(collapsed)}
      </aside>

      {/* Mobile / tablet drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(22_21_42/0.32)] data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[264px] bg-surface shadow-pop outline-none data-[state=open]:animate-slide-in-left lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
            {sidebarBody(false, () => setMobileOpen(false))}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {banner ? (
          <div role="status" className="flex items-center justify-center gap-2 bg-warning-50 px-4 py-2 text-center text-xs font-medium text-warning-700 no-print">
            <Megaphone className="size-3.5 shrink-0" />
            {banner}
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5 no-print">
          <button suppressHydrationWarning
            type="button"
            onClick={toggle}
            aria-label="Toggle navigation"
            className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken"
          >
            <Menu className="size-5" />
          </button>
          <button suppressHydrationWarning
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-left text-[13px] text-subtle shadow-card transition-colors hover:border-line-strong sm:max-w-[420px]"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search orders, customers, menu…</span>
            <span className="ml-auto hidden items-center gap-0.5 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <NotificationBell />
            <div className="hidden h-8 w-px bg-line md:block" />
            <LiveClock timeZone={session.restaurant.timezone} className="hidden md:block" />
            <div className="hidden h-8 w-px bg-line md:block" />
            <UserMenu restaurants={restaurants} onShortcuts={() => setShortcutsOpen(true)} />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} nav={nav} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function UserMenu({ restaurants, onShortcuts }: { restaurants: PickerRestaurant[]; onShortcuts: () => void }) {
  const session = useSession();
  const router = useRouter();
  const switchTo = async (id: string) => {
    const result = await selectRestaurantAction({ restaurantId: id });
    if (!result.ok) return toast.error(result.error);
    toast.success(`Switched to ${result.data.name}`);
    router.push("/app");
    router.refresh();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 text-left outline-none hover:bg-sunken data-[state=open]:bg-sunken">
        <Avatar name={session.user.name} src={session.user.avatarUrl} />
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block max-w-[150px] truncate text-[13px] font-semibold text-ink">{session.user.name}</span>
          <span className="block text-2xs text-muted">{session.role}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[260px]">
        <div className="px-2.5 py-2">
          <p className="truncate text-[13px] font-semibold text-ink">{session.user.name}</p>
          <p className="truncate text-xs text-muted">{session.user.email}</p>
        </div>
        <DropdownMenuSeparator />
        {restaurants.length > 1 ? (
          <>
            <DropdownMenuLabel>Switch restaurant</DropdownMenuLabel>
            {restaurants.map((r) => (
              <DropdownMenuItem key={r.id} onSelect={() => !r.current && switchTo(r.id)}>
                <ArrowLeftRight />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.current ? <Check className="!text-brand-500" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/app/profile">
            <UserRound />
            My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onShortcuts}>
          <Keyboard />
          Keyboard shortcuts
          <Kbd className="ml-auto">?</Kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={() => void logoutAction()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

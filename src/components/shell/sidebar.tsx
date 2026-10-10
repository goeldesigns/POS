"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Tooltip } from "@/components/ui/menu";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";

export function SidebarNav({
  items,
  collapsed,
  tone = "light",
  onNavigate,
}: {
  items: NavItem[];
  collapsed?: boolean;
  tone?: "light" | "dark";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const link = (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors",
              collapsed && "justify-center px-0",
              tone === "light"
                ? active
                  ? "bg-brand-100 text-brand-600"
                  : "text-ink-2 hover:bg-sunken hover:text-ink"
                : active
                  ? "bg-white/[0.08] text-white"
                  : "text-white/60 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "size-[18px] shrink-0",
                tone === "light" ? (active ? "text-brand-500" : "text-muted group-hover:text-ink-2") : active ? "text-brand-300" : "",
              )}
              strokeWidth={active ? 2.1 : 1.8}
            />
            {!collapsed ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
            {item.badge ? (
              <span
                className={cn(
                  "tabular grid min-w-5 place-items-center rounded-full px-1.5 text-2xs leading-5 font-semibold",
                  collapsed ? "absolute top-0.5 right-0.5 min-w-4 px-1 leading-4" : "ml-auto",
                  tone === "light" ? "bg-brand-500 text-white" : "bg-brand-400 text-white",
                )}
                aria-label={`${item.badge} new`}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href} content={item.label} side="right" delay={0}>
            {link}
          </Tooltip>
        ) : (
          <React.Fragment key={item.href}>{link}</React.Fragment>
        );
      })}
    </nav>
  );
}

const STORAGE_KEY = "tabla.sidebar.collapsed";

/**
 * Desktop collapse state, remembered per browser. `preferCollapsed` (e.g. the POS on a
 * narrow laptop) collapses it for that screen only; toggling there isn't remembered.
 */
export function useSidebarState(preferCollapsed = false) {
  const [saved, setSaved] = React.useState(false);
  const [override, setOverride] = React.useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      setSaved(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  React.useEffect(() => setOverride(null), [preferCollapsed]);
  const collapsed = override ?? (saved || preferCollapsed);
  const toggle = React.useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpen((o) => !o);
      return;
    }
    if (preferCollapsed) {
      setOverride(!collapsed);
      return;
    }
    setSaved((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, [preferCollapsed, collapsed]);
  return { collapsed, toggle, mobileOpen, setMobileOpen };
}

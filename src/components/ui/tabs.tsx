"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number | null;
  icon?: React.ReactNode;
}

/** Chip-style tabs (POS categories, quick filters). */
export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 overflow-x-auto scrollbar-none", className)}
      onWheel={(e) => {
        // Let a normal mouse wheel scroll an overflowing tab row sideways.
        const el = e.currentTarget;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY;
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button suppressHydrationWarning
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-brand-100 text-brand-600" : "text-muted hover:bg-sunken hover:text-ink",
            )}
          >
            {item.icon}
            {item.label}
            {item.count != null ? (
              <span className={cn("tabular rounded-full px-1.5 text-2xs leading-4", active ? "bg-brand-500 text-white" : "bg-sunken text-muted")}>
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Underlined section tabs driven by a search param (server-rendered pages). */
export function LinkTabs({
  items,
  param = "tab",
  defaultValue,
  className,
  preserve = [],
}: {
  items: TabItem<string>[];
  param?: string;
  defaultValue: string;
  className?: string;
  /** Other search params to keep when switching tabs. */
  preserve?: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? defaultValue;
  return (
    <div role="tablist" className={cn("flex items-center gap-5 overflow-x-auto border-b border-line scrollbar-none", className)}>
      {items.map((item) => {
        const qs = new URLSearchParams();
        for (const key of preserve) {
          const v = searchParams.get(key);
          if (v) qs.set(key, v);
        }
        if (item.value !== defaultValue) qs.set(param, item.value);
        const href = qs.toString() ? `${pathname}?${qs}` : pathname;
        const active = item.value === current;
        return (
          <Link
            key={item.value}
            href={href}
            scroll={false}
            role="tab"
            aria-selected={active}
            className={cn(
              "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[13px] font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
              active ? "border-brand-500 text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.icon}
            {item.label}
            {item.count != null ? (
              <span className={cn("tabular rounded-full px-1.5 text-2xs leading-4", active ? "bg-brand-100 text-brand-700" : "bg-sunken text-muted")}>
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Client-side underlined tabs (content switching inside a component). */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex items-center gap-5 overflow-x-auto border-b border-line scrollbar-none", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      suppressHydrationWarning
      className={cn(
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-[13px] font-medium whitespace-nowrap text-muted transition-colors hover:text-ink data-[state=active]:border-brand-500 data-[state=active]:text-ink [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

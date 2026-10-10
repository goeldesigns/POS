"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CalendarPlus, CirclePlus, ReceiptText, Search, ShoppingBag, UserPlus, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Kbd } from "@/components/ui/display";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { NavItem } from "@/lib/nav";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { NAV_ICONS } from "./nav-icons";
import { useSession } from "./session-context";

interface SearchResult {
  orders: { id: string; orderNumber: string; total: number; status: string; customerName: string | null; table: { name: string } | null }[];
  customers: { id: string; name: string; phone: string }[];
  products: { id: string; name: string; price: number; sku: string }[];
}

const ACTIONS: { label: string; href: string; icon: React.ElementType; permission: PermissionKey; keywords?: string }[] = [
  { label: "New order", href: "/app/pos", icon: ShoppingBag, permission: "pos.create_order", keywords: "bill sale pos" },
  { label: "Add customer", href: "/app/customers?new=1", icon: UserPlus, permission: "customers.create" },
  { label: "New reservation", href: "/app/reservations?new=1", icon: CalendarPlus, permission: "reservations.create", keywords: "booking" },
  { label: "Add menu item", href: "/app/menu/products/new", icon: CirclePlus, permission: "menu.create", keywords: "product dish" },
  { label: "Record expense", href: "/app/expenses?new=1", icon: Wallet, permission: "expenses.create" },
];

const itemClass =
  "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[13px] text-ink outline-none data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700 [&_svg]:size-4 [&_svg]:text-muted data-[selected=true]:[&_svg]:text-brand-500";
const groupClass =
  "px-2 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:uppercase";

export function CommandMenu({ open, onOpenChange, nav }: { open: boolean; onOpenChange: (open: boolean) => void; nav: NavItem[] }) {
  const router = useRouter();
  const session = useSession();
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => apiFetch<SearchResult>(`/api/v1/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length >= 2,
  });
  const pageMatches = nav.filter((n) => n.label.toLowerCase().includes(debounced.toLowerCase()));

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(22_21_42/0.38)] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-pop-in">
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search orders, customers, menu items and pages</DialogPrimitive.Description>
          <Command shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 text-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="Search by order #, customer name or phone, dish, or page…"
                className="h-13 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
              />
              {isFetching ? <span className="text-2xs text-subtle">Searching…</span> : <Kbd>Esc</Kbd>}
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto py-2 scrollbar-thin">
              <Command.Empty className="px-4 py-10 text-center text-[13px] text-muted">
                {debounced.length >= 2 ? `No matches for “${debounced}”` : "Type at least 2 characters"}
              </Command.Empty>

              {data?.orders.length ? (
                <Command.Group heading="Orders" className={groupClass}>
                  {data.orders.map((o) => (
                    <Command.Item key={o.id} value={`order-${o.id}`} onSelect={() => go(`/app/orders?order=${o.id}`)} className={itemClass}>
                      <ReceiptText />
                      <span className="font-medium">{o.orderNumber}</span>
                      <span className="truncate text-muted">
                        {[o.table?.name, o.customerName].filter(Boolean).join(" · ") || "Walk-in"}
                      </span>
                      <span className="tabular ml-auto text-muted">{formatMoney(o.total)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data?.customers.length ? (
                <Command.Group heading="Customers" className={groupClass}>
                  {data.customers.map((c) => (
                    <Command.Item key={c.id} value={`customer-${c.id}`} onSelect={() => go(`/app/customers/${c.id}`)} className={itemClass}>
                      <Users />
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-auto text-muted">{c.phone}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data?.products.length ? (
                <Command.Group heading="Menu" className={groupClass}>
                  {data.products.map((p) => (
                    <Command.Item key={p.id} value={`product-${p.id}`} onSelect={() => go(`/app/menu/products/${p.id}`)} className={itemClass}>
                      <UtensilsCrossed />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted">{p.sku}</span>
                      <span className="tabular ml-auto text-muted">{formatMoney(p.price)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {debounced.length < 2 || "quick".includes(debounced.toLowerCase()) ? (
                <>
                  <Command.Group heading="Quick actions" className={groupClass}>
                    {ACTIONS.filter((a) => session.can(a.permission)).map((a) => (
                      <Command.Item key={a.href} value={a.label} onSelect={() => go(a.href)} className={itemClass}>
                        <a.icon />
                        {a.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Go to" className={groupClass}>
                    {nav.map((n) => {
                      const Icon = NAV_ICONS[n.icon];
                      return (
                        <Command.Item key={n.href} value={`nav-${n.label}`} onSelect={() => go(n.href)} className={itemClass}>
                          <Icon />
                          {n.label}
                          {n.shortcut ? <Kbd className="ml-auto">{n.shortcut}</Kbd> : null}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                </>
              ) : pageMatches.length ? (
                <Command.Group heading="Pages" className={groupClass}>
                  {pageMatches.map((n) => {
                    const Icon = NAV_ICONS[n.icon];
                    return (
                      <Command.Item key={n.href} value={`nav-${n.label}`} onSelect={() => go(n.href)} className={itemClass}>
                        <Icon />
                        {n.label}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

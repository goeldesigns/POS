"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, ChefHat, CircleCheck, CreditCard, Globe, PackageMinus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/server/services/notifications";

const ICONS = { stock: PackageMinus, kitchen: ChefHat, reservation: CalendarClock, online: Globe, payment: CreditCard };
const TONES = {
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger",
  info: "bg-info-50 text-info",
  brand: "bg-brand-100 text-brand-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<AppNotification[]>("/api/v1/notifications"),
    refetchInterval: 60_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Notifications${data.length ? ` (${data.length})` : ""}`}
        className="relative grid size-9 place-items-center rounded-lg text-ink-2 outline-none hover:bg-sunken data-[state=open]:bg-sunken"
      >
        <Bell className="size-[19px]" />
        {data.length ? (
          <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-surface">
            {data.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Alerts</p>
          <span className="text-xs text-muted">Live · updates every minute</span>
        </div>
        {isLoading ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">Loading…</p>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <CircleCheck className="size-6 text-success" />
            <p className="mt-2 text-[13px] font-medium text-ink">All clear</p>
            <p className="text-xs text-muted">No stock, kitchen or booking alerts right now.</p>
          </div>
        ) : (
          <ul className="max-h-[380px] divide-y divide-line overflow-y-auto scrollbar-thin">
            {data.map((n) => {
              const Icon = ICONS[n.kind];
              return (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-canvas">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONES[n.tone])}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{n.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

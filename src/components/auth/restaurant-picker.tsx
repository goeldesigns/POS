"use client";

import { ChevronRight, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { selectRestaurantAction } from "@/server/actions/auth";

export interface PickerRestaurant {
  id: string;
  name: string;
  city: string | null;
  role: string;
  suspended: boolean;
  current: boolean;
}

export function RestaurantPicker({ restaurants, next }: { restaurants: PickerRestaurant[]; next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (id: string) => {
    setBusy(id);
    const result = await selectRestaurantAction({ restaurantId: id });
    if (!result.ok) {
      toast.error(result.error);
      setBusy(null);
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <ul className="mt-6 space-y-2">
      {restaurants.map((r) => (
        <li key={r.id}>
          <button suppressHydrationWarning
            type="button"
            disabled={!!busy}
            onClick={() => choose(r.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60",
              busy === r.id && "border-brand-400 bg-brand-50",
            )}
          >
            <span className="grid size-10 place-items-center rounded-lg bg-brand-100 text-brand-500">
              <Store className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
                {r.suspended ? <Badge tone="danger" size="sm">Suspended</Badge> : null}
              </span>
              <span className="block truncate text-xs text-muted">
                {r.role}
                {r.city ? ` · ${r.city}` : ""}
              </span>
            </span>
            <ChevronRight className="size-4 text-subtle" />
          </button>
        </li>
      ))}
    </ul>
  );
}

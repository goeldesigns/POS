"use client";

import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { useQueryParams } from "@/hooks/use-query-params";
import { ADMIN_PERIOD_OPTIONS } from "@/lib/admin";
import { cn } from "@/lib/utils";

/** Today / 7D / 30D / 3M / 12M / Custom, bound to `?period=&from=&to=`. */
export function PeriodFilter({ defaultValue = "30d", className }: { defaultValue?: string; className?: string }) {
  const { get, set, pending } = useQueryParams();
  const period = get("period") ?? defaultValue;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70", className)}>
      {period === "custom" ? <DateRangeInputs /> : null}
      <Segmented
        value={period}
        options={ADMIN_PERIOD_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))}
        onChange={(v) => set({ period: v === defaultValue ? null : v, ...(v !== "custom" ? { from: null, to: null } : {}) })}
      />
    </div>
  );
}

/** Two date inputs bound to `?from=&to=`. */
export function DateRangeInputs({ className }: { className?: string }) {
  const { get, set } = useQueryParams();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Input type="date" className="w-[146px]" defaultValue={get("from") ?? ""} max={get("to") ?? undefined} onChange={(e) => set({ from: e.target.value || null })} aria-label="From date" />
      <span className="text-xs text-muted">to</span>
      <Input type="date" className="w-[146px]" defaultValue={get("to") ?? ""} min={get("from") ?? undefined} onChange={(e) => set({ to: e.target.value || null })} aria-label="To date" />
    </div>
  );
}

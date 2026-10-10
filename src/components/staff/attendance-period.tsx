"use client";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { useQueryParams } from "@/hooks/use-query-params";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 15)).toISOString().slice(0, 7);
}

function daysAgo(today: string, n: number) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Month or date-range picker, staff switcher and the PDF download for one person's attendance. */
export function AttendancePeriodBar({
  mode,
  month,
  from,
  to,
  today,
  query,
  staffId,
  staff,
}: {
  mode: "month" | "range";
  month: string | null;
  from: string;
  to: string;
  today: string;
  query: string;
  staffId: string;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { set } = useQueryParams();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <Segmented
        value={mode}
        onChange={(v) => (v === "month" ? set({ month: from.slice(0, 7), from: null, to: null }) : set({ month: null, from, to }))}
        options={[
          { value: "month", label: "Month" },
          { value: "range", label: "Date range" },
        ]}
      />
      {mode === "month" && month ? (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => set({ month: shiftMonth(month, -1) })}>
            <ChevronLeft />
          </Button>
          <Input type="month" value={month} onChange={(e) => e.target.value && set({ month: e.target.value })} className="w-[170px]" aria-label="Month" />
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => set({ month: shiftMonth(month, 1) })}>
            <ChevronRight />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="w-[160px]" aria-label="From" />
          <span className="text-xs text-muted">to</span>
          <Input type="date" value={to} min={from} onChange={(e) => e.target.value && set({ to: e.target.value })} className="w-[160px]" aria-label="To" />
          {[
            { label: "Last 7 days", days: 6 },
            { label: "Last 30 days", days: 29 },
          ].map((q) => (
            <Button key={q.label} variant="ghost" size="xs" onClick={() => set({ from: daysAgo(today, q.days), to: today })}>
              {q.label}
            </Button>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {staff.length > 1 ? (
          <NativeSelect
            selectSize="sm"
            aria-label="Team member"
            className="w-[180px]"
            value={staffId}
            onChange={(e) => router.push(`/app/staff/${e.target.value}/attendance?${query}`)}
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <Button size="sm" onClick={() => window.open(`/print/attendance/${staffId}?${query}`, "_blank")}>
          <Download /> Download PDF
        </Button>
      </div>
    </div>
  );
}

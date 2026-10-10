"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Restaurant-local date & time, refreshed every 30 seconds. */
export function LiveClock({ timeZone, className }: { timeZone: string; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <div className={cn("h-8 w-[104px]", className)} />;
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone }).format(now);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(now).toUpperCase();
  return (
    <div className={cn("text-right leading-tight", className)}>
      <p className="text-[13px] font-medium text-ink">{date}</p>
      <p className="tabular text-2xs text-muted">{time}</p>
    </div>
  );
}

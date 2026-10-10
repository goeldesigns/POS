import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Accent = "brand" | "success" | "warning" | "info" | "danger" | "neutral";

const accents: Record<Accent, string> = {
  brand: "bg-brand-100 text-brand-500",
  success: "bg-success-50 text-success",
  warning: "bg-warning-50 text-warning-700",
  info: "bg-info-50 text-info",
  danger: "bg-danger-50 text-danger",
  neutral: "bg-sunken text-muted",
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: Accent;
  /** Percentage change; null hides the delta. */
  delta?: number | null;
  /** Shown after the delta, e.g. "vs yesterday". */
  caption?: React.ReactNode;
  /** Whether an increase is good (green) or bad (red). */
  upIsGood?: boolean;
  /** Use an absolute delta string instead of a percentage. */
  deltaLabel?: string;
  className?: string;
  footer?: React.ReactNode;
}

/** KPI tile: icon chip, label, value, signed delta vs a named period. */
export function StatCard({
  label,
  value,
  icon,
  accent = "brand",
  delta,
  caption,
  upIsGood = true,
  deltaLabel,
  className,
  footer,
}: StatCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  // A change that rounds to 0.0% is "no change": neutral, not green.
  const flat = hasDelta && Math.abs(delta!) < 0.05 && !deltaLabel?.match(/[1-9]/);
  const up = hasDelta && delta! >= 0;
  const good = hasDelta && (up ? upIsGood : !upIsGood);
  return (
    <div className={cn("flex gap-3.5 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card", className)}>
      {icon ? (
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", accents[accent])}>{icon}</div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-muted">{label}</p>
        <p className="mt-0.5 truncate text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{value}</p>
        {hasDelta || caption ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {hasDelta ? (
              <span className={cn("inline-flex items-center gap-0.5 font-semibold", flat ? "text-muted" : good ? "text-success-700" : "text-danger-700")}>
                {flat ? <ArrowRight className="size-3.5" aria-hidden /> : up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                {deltaLabel ?? `${Math.abs(delta!).toFixed(1)}%`}
                <span className="sr-only">{flat ? "no change" : up ? "increase" : "decrease"}</span>
              </span>
            ) : null}
            {caption ? <span>{caption}</span> : null}
          </p>
        ) : null}
        {footer}
      </div>
    </div>
  );
}

/** Compact metric for secondary rows (no icon chip). */
export function MiniStat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3", className)}>
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-subtle">{sub}</p> : null}
    </div>
  );
}

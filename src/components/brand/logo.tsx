import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Plate-and-table mark: a ring (plate) resting on a bar (table top). */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px]",
        inverted ? "bg-white text-brand-500" : "bg-brand-500 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="10" r="5.2" />
        <circle cx="12" cy="10" r="1.6" fill="currentColor" stroke="none" />
        <path d="M4.5 19h15" />
      </svg>
    </span>
  );
}

export function Logo({ subtitle = BRAND.tagline, className, inverted }: { subtitle?: string | null; className?: string; inverted?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark inverted={inverted} />
      <span className="min-w-0 leading-tight">
        <span className={cn("block text-[15px] font-semibold tracking-[-0.01em]", inverted ? "text-white" : "text-ink")}>{BRAND.name}</span>
        {subtitle ? <span className={cn("block truncate text-2xs", inverted ? "text-white/60" : "text-muted")}>{subtitle}</span> : null}
      </span>
    </span>
  );
}

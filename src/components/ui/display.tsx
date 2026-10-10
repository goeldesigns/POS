import * as React from "react";
import { cn, initials } from "@/lib/utils";
import { statusOf, type Tone } from "@/lib/labels";

// ─── Card ───────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        {title ? <h3 className="text-[15px] font-semibold text-ink">{title}</h3> : null}
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

// ─── Badge ──────────────────────────────────────────────────────────────────

const toneClasses: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  brand: "bg-brand-100 text-brand-700 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-success-100",
  warning: "bg-warning-50 text-warning-700 ring-warning-100",
  danger: "bg-danger-50 text-danger-700 ring-danger-100",
  info: "bg-info-50 text-info-700 ring-info-100",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-subtle",
  brand: "bg-brand-500",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Badge({
  tone = "neutral",
  dot,
  size = "md",
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "h-5 px-1.5 text-2xs" : "h-[22px] px-2 text-xs",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", dotClasses[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({
  dict,
  value,
  size,
  dot = true,
}: {
  dict: Parameters<typeof statusOf>[0];
  value: string | null | undefined;
  size?: "sm" | "md";
  dot?: boolean;
}) {
  const s = statusOf(dict, value);
  return (
    <Badge tone={s.tone} size={size} dot={dot}>
      {s.label}
    </Badge>
  );
}

// ─── Food type marker (Indian veg / non-veg symbol) ─────────────────────────

export function FoodTypeMark({ type, className }: { type: string; className?: string }) {
  const color = type === "NON_VEG" ? "#c0392b" : type === "EGG" ? "#d68910" : "#1e8e3e";
  const label = type === "NON_VEG" ? "Non-veg" : type === "EGG" ? "Contains egg" : type === "VEGAN" ? "Vegan" : "Veg";
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-grid size-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px] bg-white", className)}
      style={{ borderColor: color }}
    >
      {type === "NON_VEG" ? (
        <span className="size-0 border-x-[3.5px] border-b-[6px] border-x-transparent" style={{ borderBottomColor: color }} />
      ) : (
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      )}
    </span>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-brand-100 text-brand-700",
  "bg-[#fdeee6] text-[#b14a1f]",
  "bg-[#e3f6ee] text-[#167a50]",
  "bg-[#fdf3dc] text-[#94620a]",
  "bg-[#fbe9f0] text-[#a83a64]",
  "bg-[#e7f0fd] text-[#1d5fd0]",
];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const s = { xs: "size-6 text-[10px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm" }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover", s, className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", s, AVATAR_COLORS[hash(name) % AVATAR_COLORS.length], className)}
    >
      {initials(name)}
    </span>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-sunken", className)} {...props} />;
}

// ─── Kbd ────────────────────────────────────────────────────────────────────

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-surface px-1 font-sans text-[10.5px] font-medium text-muted shadow-[0_1px_0_var(--color-line)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ─── Empty / error states ───────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-6 py-8" : "px-6 py-14", className)}>
      {icon ? (
        <div className="mb-3.5 grid size-11 place-items-center rounded-xl border border-line bg-canvas text-muted [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-[380px] text-[13px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function InlineAlert({
  tone = "info",
  title,
  children,
  icon,
  className,
  action,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl px-3.5 py-3 text-[13px] ring-1 ring-inset", toneClasses[tone], className)}>
      {icon ? <span className="mt-px shrink-0 [&_svg]:size-4">{icon}</span> : null}
      <div className="min-w-0 flex-1 leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

// ─── Description list ───────────────────────────────────────────────────────

export function DetailList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-0.5 truncate text-[13px] font-medium text-ink">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}

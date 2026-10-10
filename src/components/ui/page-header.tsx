import Link from "next/link";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-5", className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs text-muted">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.label}>
              {i > 0 ? <ChevronRight className="size-3 text-subtle" aria-hidden /> : null}
              {b.href ? (
                <Link href={b.href} className="hover:text-ink">
                  {b.label}
                </Link>
              ) : (
                <span className="text-ink-2">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

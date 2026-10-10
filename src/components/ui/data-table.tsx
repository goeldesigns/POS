"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import * as React from "react";
import { useQueryParams } from "@/hooks/use-query-params";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input, NativeSelect } from "./input";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Enables server sorting by this key (`?sort=key&dir=asc`). */
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  /** Hide on narrow screens. */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const hideClass = { sm: "max-sm:hidden", md: "max-md:hidden", lg: "max-lg:hidden", xl: "max-xl:hidden", "2xl": "max-2xl:hidden" } as const;

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  empty,
  className,
  dense,
  selectedId,
  stickyHeader = true,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
  dense?: boolean;
  selectedId?: string | null;
  stickyHeader?: boolean;
  footer?: React.ReactNode;
}) {
  const { get, set, pending } = useQueryParams();
  const sort = get("sort");
  const dir = get("dir") === "asc" ? "asc" : "desc";

  const toggleSort = (key: string) => {
    if (sort !== key) set({ sort: key, dir: "desc" });
    else if (dir === "desc") set({ sort: key, dir: "asc" });
    else set({ sort: null, dir: null });
  };

  return (
    <div className={cn("relative overflow-x-auto scrollbar-thin", pending && "opacity-70 transition-opacity", className)}>
      <table className="w-full border-separate sm:min-w-[640px] border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "border-b border-line bg-canvas/70 px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5",
                  stickyHeader && "sticky top-0 z-[1] backdrop-blur",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.hideBelow && hideClass[c.hideBelow],
                  c.headerClassName,
                )}
                aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {c.sortable ? (
                  <button suppressHydrationWarning
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn("inline-flex items-center gap-1 hover:text-ink", sort === c.key && "text-ink")}
                  >
                    {c.header}
                    {sort === c.key ? (
                      dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "group transition-colors",
                    onRowClick && "cursor-pointer hover:bg-canvas",
                    selectedId === id && "bg-brand-50",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "border-b border-line px-4 align-middle text-ink first:pl-5 last:pr-5 group-last:border-b-0",
                        dense ? "py-2" : "py-3",
                        c.align === "right" && "text-right tabular",
                        c.align === "center" && "text-center",
                        c.hideBelow && hideClass[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {footer}
    </div>
  );
}

export function Pagination({ page, pageSize, total, className }: { page: number; pageSize: number; total: number; className?: string }) {
  const { set, pending } = useQueryParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted", className)}>
      <p className="tabular">
        {total === 0 ? "No results" : (
          <>
            Showing <span className="font-medium text-ink">{from.toLocaleString("en-IN")}</span>–
            <span className="font-medium text-ink">{to.toLocaleString("en-IN")}</span> of{" "}
            <span className="font-medium text-ink">{total.toLocaleString("en-IN")}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <NativeSelect
          selectSize="sm"
          aria-label="Rows per page"
          value={String(pageSize)}
          onChange={(e) => set({ pageSize: e.target.value })}
          className="w-[112px]"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1 || pending} onClick={() => set({ page: page - 1 })}>
          <ChevronLeft />
        </Button>
        <span className="tabular min-w-[64px] text-center">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pages || pending} onClick={() => set({ page: page + 1 })}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Debounced search box bound to `?q=`. */
export function SearchParamInput({
  placeholder = "Search…",
  param = "q",
  className,
}: {
  placeholder?: string;
  param?: string;
  className?: string;
}) {
  const { get, set } = useQueryParams();
  const [value, setValue] = React.useState(get(param) ?? "");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setValue(get(param) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get(param)]);

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ [param]: next.trim() || null }), 300);
  };

  return (
    <Input
      className={cn("w-full sm:w-[280px]", className)}
      prefix={<Search />}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      suffix={
        value ? (
          <button suppressHydrationWarning type="button" aria-label="Clear search" className="rounded p-0.5 text-subtle hover:text-ink" onClick={() => onChange("")}>
            <X />
          </button>
        ) : undefined
      }
    />
  );
}

/** Select bound to a search param. */
export function FilterSelect({
  param,
  options,
  allLabel,
  className,
  label,
}: {
  param: string;
  options: { value: string; label: string }[];
  allLabel: string;
  className?: string;
  label?: string;
}) {
  const { get, set } = useQueryParams();
  return (
    <NativeSelect
      aria-label={label ?? allLabel}
      className={cn("w-[160px]", className)}
      value={get(param) ?? ""}
      onChange={(e) => set({ [param]: e.target.value || null })}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Wrapper for list pages: toolbar above a table card. */
export function TableCard({ toolbar, children, className }: { toolbar?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">{toolbar}</div> : null}
      {children}
    </div>
  );
}

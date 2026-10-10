"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Categorical order validated for CVD separation on white (brand first).
 * Fixed order — never cycled; a 7th series folds into "Other".
 */
export const SERIES = ["#5040D0", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#2A78D6"] as const;
type ChartRow = Record<string, string | number | boolean | null>;

export const DEEMPHASIS = "#C9C7D4";
const AXIS = { fontSize: 11, fill: "#9A99A5" };

export type ValueKind = "money" | "number" | "percent";

function fmt(kind: ValueKind, v: number, compact = false) {
  if (kind === "money") return compact ? formatMoneyCompact(v) : formatMoney(v, { decimals: "auto" });
  if (kind === "percent") return `${v.toFixed(1)}%`;
  return compact ? (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : formatNumber(v)) : formatNumber(v, 2);
}

interface TooltipRow {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  kind,
  names,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string | number;
  kind: ValueKind;
  names?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label != null ? <p className="mb-1.5 font-medium text-ink">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
              {names?.[String(p.dataKey)] ?? p.name}
            </span>
            <span className="tabular font-semibold text-ink">{fmt(kind, Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-3.5 rounded-full"
            style={i.dashed ? { backgroundImage: `linear-gradient(90deg, ${i.color} 60%, transparent 60%)`, backgroundSize: "5px 2px" } : { background: i.color }}
            aria-hidden
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ─── Trend (area, with optional comparison period) ──────────────────────────

/** Keep a readable axis when every value is 0 (otherwise every tick reads "₹0"). */
function yDomain(kind: ValueKind, rows: Record<string, unknown>[], keys: (string | undefined)[]): [number, number] | undefined {
  const empty = rows.every((r) => keys.every((k) => !k || !Number(r[k])));
  return empty ? [0, kind === "money" ? 100_000 : kind === "percent" ? 100 : 10] : undefined;
}

export function TrendChart<T extends Record<string, unknown>>({
  data,
  xKey,
  current,
  previous,
  kind = "money",
  height = 260,
  currentLabel = "This period",
  previousLabel = "Previous period",
}: {
  data: T[];
  xKey: keyof T & string;
  current: keyof T & string;
  previous?: keyof T & string;
  kind?: ValueKind;
  height?: number;
  currentLabel?: string;
  previousLabel?: string;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div>
      {previous ? (
        <div className="mb-2 flex justify-end">
          <Legend
            items={[
              { label: currentLabel, color: SERIES[0] },
              { label: previousLabel, color: DEEMPHASIS, dashed: true },
            ]}
          />
        </div>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data as ChartRow[]} margin={{ top: 10, right: 6, bottom: 0, left: -6 }}>
            <defs>
              <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.14} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis dataKey={xKey as string} tickLine={false} axisLine={false} tick={AXIS} minTickGap={18} dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS} width={56} allowDecimals={kind !== "number"} domain={yDomain(kind, data, [current, previous])} tickFormatter={(v: number) => fmt(kind, v, true)} />
            <Tooltip
              cursor={{ strokeWidth: 1 }}
              content={<ChartTooltip kind={kind} names={{ [current]: currentLabel, ...(previous ? { [previous]: previousLabel } : {}) }} />}
            />
            {previous ? (
              <Area
                type="monotone"
                dataKey={previous as string}
                stroke={DEEMPHASIS}
                strokeWidth={2}
                strokeDasharray="4 4"
                fill="transparent"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: DEEMPHASIS }}
                isAnimationActive={false}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey={current as string}
              stroke={SERIES[0]}
              strokeWidth={2}
              fill={`url(#fill-${id})`}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff", fill: SERIES[0] }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Multi-line (≤ 6 series) ────────────────────────────────────────────────

export function MultiLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  kind = "number",
  height = 260,
}: {
  data: T[];
  xKey: keyof T & string;
  series: { key: keyof T & string; label: string }[];
  kind?: ValueKind;
  height?: number;
}) {
  const names = Object.fromEntries(series.map((s) => [s.key, s.label]));
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Legend items={series.map((s, i) => ({ label: s.label, color: SERIES[i % SERIES.length]! }))} />
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data as ChartRow[]} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey as string} tickLine={false} axisLine={false} tick={AXIS} minTickGap={18} dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS} width={56} allowDecimals={kind !== "number"} domain={yDomain(kind, data, series.map((x) => x.key))} tickFormatter={(v: number) => fmt(kind, v, true)} />
            <Tooltip cursor={{ strokeWidth: 1 }} content={<ChartTooltip kind={kind} names={names} />} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key as string}
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Columns (single series) ────────────────────────────────────────────────

export function ColumnChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  label,
  kind = "money",
  height = 240,
  highlightKey,
}: {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  label: string;
  kind?: ValueKind;
  height?: number;
  /** Rows where this boolean key is true use the accent; others the de-emphasis hue. */
  highlightKey?: keyof T & string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as ChartRow[]} margin={{ top: 6, right: 6, bottom: 0, left: -6 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey as string} tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" minTickGap={6} dy={6} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={56} allowDecimals={kind !== "number"} domain={yDomain(kind, data, [yKey])} tickFormatter={(v: number) => fmt(kind, v, true)} />
          <Tooltip cursor={{ fill: "rgb(80 64 208 / 0.06)" }} content={<ChartTooltip kind={kind} names={{ [yKey]: label }} />} />
          <Bar dataKey={yKey as string} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row, i) => (
              <Cell key={i} fill={highlightKey ? (row[highlightKey] ? SERIES[0] : "#C9C2F2") : SERIES[0]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Donut with value legend ────────────────────────────────────────────────

export function DonutChart({
  data,
  kind = "number",
  centerLabel,
  centerValue,
  size = 168,
  className,
}: {
  data: { label: string; value: number }[];
  kind?: ValueKind;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  className?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const rows = data.length > SERIES.length ? [...data.slice(0, SERIES.length - 1), { label: "Other", value: data.slice(SERIES.length - 1).reduce((s, d) => s + d.value, 0) }] : data;
  return (
    <div className={cn("@container", className)}>
    <div className="flex flex-col items-center gap-5 @[400px]:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                    <p className="font-medium text-ink">{payload[0]!.name}</p>
                    <p className="tabular text-muted">
                      {fmt(kind, Number(payload[0]!.value))} · {total ? ((Number(payload[0]!.value) / total) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                ) : null
              }
            />
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={rows.length > 1 ? 1.5 : 0}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {rows.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[17px] leading-tight font-semibold text-ink">{centerValue}</p>
              {centerLabel ? <p className="text-2xs text-muted">{centerLabel}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {rows.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2.5 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-2">{d.label}</span>
            <span className="tabular text-muted">{total ? ((d.value / total) * 100).toFixed(0) : 0}%</span>
            <span className="tabular min-w-[56px] text-right font-medium text-ink">{fmt(kind, d.value, true)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

// ─── Ranked bar list (HTML — crisper than a chart for "top N") ─────────────

export function RankedBars({
  rows,
  kind = "money",
  emptyLabel = "No data for this period",
}: {
  rows: { label: React.ReactNode; value: number; sub?: React.ReactNode; key: string }[];
  kind?: ValueKind;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-muted">{emptyLabel}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink-2">{r.label}</span>
            <span className="tabular shrink-0 font-medium text-ink">{fmt(kind, r.value)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
            {r.sub ? <span className="tabular w-[64px] shrink-0 text-right text-2xs text-muted">{r.sub}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tiny inline sparkline for table rows / tiles. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className={cn("h-8 w-24", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={SERIES[0]} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

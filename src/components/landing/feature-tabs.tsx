"use client";

import { Armchair, BookOpenCheck, Boxes, ChartPie, ChefHat, Check, MonitorSmartphone, type LucideIcon } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./frames";
import { useInView } from "./motion";

export interface FeatureTab {
  key: string;
  label: string;
  title: string;
  text: string;
  points: string[];
  image: StaticImageData;
  alt: string;
  url: string;
}

const ICONS: Record<string, { icon: LucideIcon; tone: string; bar: string }> = {
  billing: { icon: MonitorSmartphone, tone: "bg-brand-100 text-brand-600", bar: "bg-brand-500" },
  kitchen: { icon: ChefHat, tone: "bg-saffron/12 text-saffron", bar: "bg-saffron" },
  tables: { icon: Armchair, tone: "bg-turmeric/15 text-[#b77c00]", bar: "bg-turmeric" },
  recipes: { icon: BookOpenCheck, tone: "bg-blush/15 text-[#c4507d]", bar: "bg-blush" },
  inventory: { icon: Boxes, tone: "bg-mint/12 text-mint", bar: "bg-mint" },
  reports: { icon: ChartPie, tone: "bg-ocean/12 text-ocean", bar: "bg-ocean" },
};

const DURATION = 7000;

export function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [index, setIndex] = React.useState(0);
  const [cycle, setCycle] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (!inView || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % tabs.length);
      setCycle((c) => c + 1);
    }, DURATION);
    return () => clearTimeout(id);
  }, [inView, paused, index, cycle, tabs.length]);

  // On phones the tabs scroll sideways: keep the active one visible (horizontally only).
  React.useEffect(() => {
    const list = listRef.current;
    const tab = list?.children[index] as HTMLElement | undefined;
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = list.scrollLeft + tab.getBoundingClientRect().left - list.getBoundingClientRect().left - 16;
    list.scrollTo({ left, behavior: "smooth" });
  }, [index]);

  const select = (i: number) => {
    setIndex(i);
    setCycle((c) => c + 1);
  };
  const tab = tabs[index]!;

  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      {/* Tab list */}
      <div ref={listRef} role="tablist" aria-label="Product areas" aria-orientation="vertical" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {tabs.map((t, i) => {
          const meta = ICONS[t.key] ?? ICONS.billing!;
          const Icon = meta.icon;
          const active = i === index;
          return (
            <button
              suppressHydrationWarning
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="feature-panel"
              onClick={() => select(i)}
              className={cn(
                "group relative shrink-0 overflow-hidden rounded-2xl border text-left transition-all duration-300 lg:w-full",
                active ? "border-line bg-surface shadow-raised" : "border-transparent hover:bg-surface/70",
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3 lg:py-3.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-300", meta.tone, active && "scale-105")}>
                  <Icon className="size-[18px]" />
                </span>
                <span className={cn("text-[14.5px] font-semibold whitespace-nowrap", active ? "text-ink" : "text-ink-2")}>{t.label}</span>
              </div>
              <div className="lp-collapse hidden lg:grid" data-open={active ? "" : undefined}>
                <div>
                  <p className="px-4 pb-4 pl-16 text-[13.5px] leading-relaxed text-muted">{t.text}</p>
                </div>
              </div>
              {active ? (
                <span className="absolute inset-x-0 bottom-0 h-[3px] bg-sunken">
                  <span
                    key={cycle}
                    className={cn("lp-progress block h-full", meta.bar)}
                    data-paused={paused || !inView ? "" : undefined}
                    style={{ "--lp-duration": `${DURATION}ms` } as React.CSSProperties}
                  />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div id="feature-panel" role="tabpanel" aria-label={tab.label} className="min-w-0">
        <BrowserFrame label={tab.url}>
          <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
            <Image
              key={tab.key}
              src={tab.image}
              alt={tab.alt}
              fill
              sizes="(min-width: 1024px) 760px, 100vw"
              className="lp-shot-enter object-cover object-top"
              placeholder="blur"
            />
          </div>
        </BrowserFrame>
        <div key={`copy-${tab.key}`} className="lp-step-in mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-8">
          <div>
            <h3 className="text-[20px] leading-snug font-semibold tracking-[-0.01em] text-ink">{tab.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted lg:hidden">{tab.text}</p>
          </div>
          <ul className="grid gap-2.5">
            {tab.points.map((p) => (
              <li key={p} className="flex gap-2.5 text-[14px] leading-snug text-ink-2">
                <Check className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={2.5} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

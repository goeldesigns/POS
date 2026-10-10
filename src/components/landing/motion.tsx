"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Anim = "up" | "down" | "left" | "right" | "scale" | "blur" | "tilt" | "clip" | "fade";

// One observer for the whole page; elements are revealed once.
let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function observe(el: Element, onEnter: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    onEnter();
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
      }
    },
    // Reveal as soon as an element crosses a line ~10% above the bottom edge,
    // regardless of how tall it is.
    { rootMargin: "0px 0px -10% 0px", threshold: 0 },
  );
  callbacks.set(el, onEnter);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}

export function useInView<T extends Element>(ref: React.RefObject<T | null>) {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    if (!ref.current) return;
    return observe(ref.current, () => setInView(true));
  }, [ref]);
  return inView;
}

/** Fades/slides children in when they scroll into view. */
export function Reveal({
  as: Tag = "div",
  anim = "up",
  delay = 0,
  loop,
  className,
  children,
  style,
  ...rest
}: {
  as?: "div" | "section" | "li" | "span" | "article" | "figure" | "ul";
  anim?: Anim;
  delay?: number;
  /** Also gates looping CSS animations inside until visible. */
  loop?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref);
  return React.createElement(
    Tag,
    {
      ...rest,
      ref,
      "data-anim": anim,
      "data-in": inView ? "" : undefined,
      className: cn("lp-reveal", loop && "lp-loop", className),
      style: { ...style, "--lp-delay": `${delay}ms` } as React.CSSProperties,
    },
    children,
  );
}

/** Counts up to `value` the first time it scrolls into view. */
export function CountUp({ value, duration = 1400, prefix = "", suffix = "" }: { value: number; duration?: number; prefix?: string; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return (
    <span ref={ref} className="tabular">
      {prefix}
      {shown.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/** Cycles through words with a vertical slot-machine slide. */
export function RotatingWords({ words, interval = 2400, className }: { words: string[]; interval?: number; className?: string }) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);
  const longest = words.reduce((a, w) => (w.length > a.length ? w : a), "");
  return (
    <span className={cn("relative inline-grid overflow-hidden align-bottom", className)} aria-live="polite">
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {longest}
      </span>
      {words.map((w, i) => (
        <span
          key={w}
          className="lp-word col-start-1 row-start-1"
          aria-hidden={i !== index}
          style={{
            transform: i === index ? "translateY(0)" : i === (index - 1 + words.length) % words.length ? "translateY(-110%)" : "translateY(110%)",
            opacity: i === index ? 1 : 0,
          }}
        >
          {w}
        </span>
      ))}
    </span>
  );
}

/** Card with a soft glow that follows the pointer (`lp-spot`). */
export function SpotCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn("lp-spot", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--lp-x", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--lp-y", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

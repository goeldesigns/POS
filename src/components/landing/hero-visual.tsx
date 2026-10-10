"use client";

import { Armchair, ChefHat, Gift, Globe, IndianRupee, PackageMinus, type LucideIcon } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";
import { BrowserFrame, PhoneFrame } from "./frames";

const EVENTS: { icon: LucideIcon; tone: string; title: string; sub: string }[] = [
  { icon: ChefHat, tone: "bg-saffron/12 text-saffron", title: "KOT sent to Tandoor", sub: "Table T05 · 2× Paneer Tikka" },
  { icon: IndianRupee, tone: "bg-mint/12 text-mint", title: "UPI payment received", sub: "₹1,260 · ORD-4941" },
  { icon: Globe, tone: "bg-ocean/12 text-ocean", title: "Online order accepted", sub: "Delivery · 3 items · prepaid" },
  { icon: PackageMinus, tone: "bg-turmeric/15 text-[#b77c00]", title: "Paneer running low", sub: "1.2 kg left · reorder from Kaveri Dairy" },
  { icon: Armchair, tone: "bg-brand-100 text-brand-600", title: "Table T08 is free", sub: "Bill settled · freed for the next seating" },
  { icon: Gift, tone: "bg-blush/15 text-[#c4507d]", title: "42 points earned", sub: "Farah K. · loyalty member" },
];

/** Hero composite: POS in a browser, the owner's phone, and a live event feed. */
export function HeroVisual({ pos, phone }: { pos: StaticImageData; phone: StaticImageData }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [step, setStep] = React.useState(0);

  // Live feed: a new event every few seconds.
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => s + 1), 2600);
    return () => clearInterval(id);
  }, []);

  // Scroll-linked tilt: the screen lies back slightly, then flattens as you scroll.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const progress = Math.min(1, Math.max(0, window.scrollY / 520));
      el.style.setProperty("--lp-tilt", `${(1 - progress) * 9}deg`);
      el.style.setProperty("--lp-phone-y", `${progress * -36}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const feed = [0, 1, 2].map((i) => ({ index: step - i, event: EVENTS[(((step - i) % EVENTS.length) + EVENTS.length) % EVENTS.length]! }));

  return (
    <div ref={ref} className="relative" style={{ "--lp-tilt": "9deg" } as React.CSSProperties}>
      <div className="lp-frame-in" style={{ transformOrigin: "50% 100%" }}>
        <div style={{ transform: "perspective(1600px) rotateX(var(--lp-tilt))", transformOrigin: "50% 100%", transition: "transform 120ms linear" }}>
        <BrowserFrame label="Tabla · POS">
          <Image src={pos} alt="Tabla POS: menu grid with photos and a running dine-in order for table P1 with GST and service charge" priority sizes="(min-width: 1024px) 760px, 100vw" className="h-auto w-full" placeholder="blur" />
        </BrowserFrame>
        </div>
      </div>

      {/* Owner's phone */}
      <div
        className="absolute -bottom-12 left-4 hidden w-[160px] sm:block lg:left-6 lg:w-[176px]"
        style={{ transform: "translateY(var(--lp-phone-y, 0px))", transition: "transform 120ms linear" }}
      >
        <div className="lp-rise" style={{ "--lp-delay": "700ms" } as React.CSSProperties}>
          <PhoneFrame>
            <Image src={phone} alt="Tabla Overview on a phone: this month's sales, orders and customers" sizes="190px" className="h-auto w-full" placeholder="blur" />
          </PhoneFrame>
        </div>
      </div>

      {/* Live feed */}
      <div className="pointer-events-none absolute -top-8 right-2 hidden w-[272px] md:block lg:-right-6">
        <div className="lp-rise rounded-2xl border border-line bg-surface/95 p-2.5 shadow-pop backdrop-blur" style={{ "--lp-delay": "900ms" } as React.CSSProperties}>
          <p className="flex items-center gap-2 px-1.5 pt-0.5 pb-2 text-2xs font-semibold tracking-wide text-muted uppercase">
            <span className="relative flex size-2">
              <span className="lp-ping absolute inline-flex size-full rounded-full bg-mint" />
              <span className="relative inline-flex size-2 rounded-full bg-mint" />
            </span>
            Live at Spice &amp; Stone
          </p>
          <ul className="space-y-1.5">
            {feed.map(({ index, event }, i) => {
              const Icon = event.icon;
              return (
                <li
                  key={index}
                  className={cn("flex items-center gap-2.5 rounded-xl bg-canvas px-2.5 py-2 transition-opacity duration-500", i === 0 && "lp-ticket-in", i === 2 && "opacity-50")}
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", event.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">{event.title}</span>
                    <span className="block truncate text-[11px] text-muted">{event.sub}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

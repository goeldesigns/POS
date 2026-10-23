"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";
import { FAQS } from "./faq-data";


export function Faq() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <div className="mx-auto max-w-[820px] divide-y divide-line rounded-[22px] border border-line bg-surface shadow-card">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <Reveal key={f.q} anim="up" delay={Math.min(i, 5) * 60}>
            <h3>
              <button
                suppressHydrationWarning
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[15.5px] font-semibold text-ink hover:text-brand-600"
              >
                {f.q}
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border transition-all duration-300",
                    isOpen ? "rotate-45 border-brand-500 bg-brand-500 text-white" : "border-line text-muted",
                  )}
                  aria-hidden
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <div id={`faq-${i}`} className="lp-collapse" data-open={isOpen ? "" : undefined} role="region">
              <div>
                <p className="px-6 pb-6 text-[14.5px] leading-relaxed text-muted">{f.a}</p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

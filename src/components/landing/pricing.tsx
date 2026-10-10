"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Reveal, SpotCard } from "./motion";

export interface PublicPlan {
  key: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  limits: string[];
  /** Name of the cheaper plan this one builds on. */
  inherits: string | null;
  modules: string[];
  extras: string[];
}

const money = (minor: number) => formatMoney(minor, { decimals: 0 });

export function Pricing({ plans, signupPlanKey, signupEnabled }: { plans: PublicPlan[]; signupPlanKey: string; signupEnabled: boolean }) {
  const [yearly, setYearly] = React.useState(false);
  const recommended = plans.length >= 3 ? plans[Math.floor((plans.length - 1) / 2)]?.key : null;
  const maxSaving = Math.max(0, ...plans.map((p) => (p.priceMonthly ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0)));

  return (
    <div>
      <Reveal anim="up" className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="relative inline-grid grid-cols-2 rounded-full border border-line bg-surface p-1 shadow-card">
          <span
            className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-brand-500 shadow-[0_2px_8px_rgb(80_64_208/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ transform: yearly ? "translateX(100%)" : "none" }}
            aria-hidden
          />
          {[
            { v: false, label: "Monthly" },
            { v: true, label: maxSaving ? `Yearly · save up to ${maxSaving}%` : "Yearly" },
          ].map((o) => (
            <button
              suppressHydrationWarning
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={yearly === o.v}
              onClick={() => setYearly(o.v)}
              className={cn("relative z-[1] rounded-full px-5 py-2 text-[13.5px] font-semibold whitespace-nowrap transition-colors", yearly === o.v ? "text-white" : "text-muted hover:text-ink")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Reveal>

      <div className={cn("mt-12 grid gap-5", plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2", "mx-auto max-w-[1080px]")}>
        {plans.map((p, i) => {
          const featured = p.key === recommended;
          const perMonth = yearly ? Math.round(p.priceYearly / 12) : p.priceMonthly;
          const saving = p.priceMonthly ? Math.max(0, Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100)) : 0;
          const trialCta = signupEnabled && p.key === signupPlanKey;
          return (
            <Reveal key={p.key} anim="up" delay={i * 120} className={cn(featured && "lg:-mt-4")}>
              <SpotCard
                className={cn(
                  "lp-lift flex h-full flex-col rounded-[22px] border bg-surface p-6 sm:p-7",
                  featured ? "border-brand-500 shadow-[0_24px_60px_-24px_rgb(80_64_208/0.45)] ring-1 ring-brand-500" : "border-line shadow-card",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[17px] font-semibold text-ink">{p.name}</h3>
                  {featured ? <span className="rounded-full bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white">Recommended</span> : null}
                </div>
                {p.description ? <p className="mt-1.5 min-h-[40px] text-[13.5px] leading-relaxed text-muted">{p.description}</p> : null}

                <div className="mt-5 flex items-end gap-1.5 overflow-hidden">
                  <span key={`${p.key}-${yearly}`} className="lp-number-in text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink tabular">
                    {money(perMonth)}
                  </span>
                  <span className="pb-1 text-[13.5px] text-muted">/ month</span>
                </div>
                <p className="mt-2 h-5 text-[12.5px] text-muted">
                  {yearly ? (
                    <>
                      {money(p.priceYearly)} billed yearly{saving ? <span className="ml-1.5 font-semibold text-mint">save {saving}%</span> : null}
                    </>
                  ) : p.trialDays ? (
                    `${p.trialDays}-day free trial`
                  ) : (
                    "Billed monthly"
                  )}
                </p>

                <Button asChild size="lg" variant={featured ? "primary" : "outline"} className={cn("mt-6 w-full", featured && "lp-sheen")}>
                  {trialCta ? (
                    <Link href="/auth/signup">
                      Start free trial <ArrowRight />
                    </Link>
                  ) : (
                    <a href="#demo">
                      Book a demo <ArrowRight />
                    </a>
                  )}
                </Button>

                <div className="mt-7 border-t border-line pt-6">
                  <p className="text-[12px] font-semibold tracking-wide text-subtle uppercase">{p.inherits ? `Everything in ${p.inherits}, plus` : "Includes"}</p>
                  <ul className="mt-3 space-y-2.5 text-[13.5px] text-ink-2">
                    {[...p.limits, ...p.modules, ...p.extras].map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check className={cn("mt-0.5 size-4 shrink-0", featured ? "text-brand-500" : "text-mint")} strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </SpotCard>
            </Reveal>
          );
        })}
      </div>
      <Reveal anim="fade" className="mt-10 text-center text-[13.5px] text-muted">
        Prices in INR. Running several outlets or need something custom?{" "}
        <a href="#demo" className="font-semibold text-brand-600 hover:underline">
          Book a demo
        </a>{" "}
        and we&apos;ll put a plan together.
      </Reveal>
    </div>
  );
}

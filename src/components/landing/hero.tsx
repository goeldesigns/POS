import { ArrowRight, Check, CirclePlay } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import overviewMobile from "../../../public/landing/overview-mobile.webp";
import posShot from "../../../public/landing/pos.webp";
import { displayFont } from "./fonts";
import { HeroVisual } from "./hero-visual";
import { RotatingWords } from "./motion";
import { SignInButton } from "./signin";

const rise = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as React.CSSProperties;

export function Hero({ trialDays, signupEnabled }: { trialDays: number; signupEnabled: boolean }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-24 sm:pt-32 lg:pt-36 lg:pb-32">
      {/* Backdrop: fine grid fading out, two slow-drifting glows in brand colours */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)",
          }}
        />
        <div className="lp-drift absolute -top-40 left-[8%] size-[520px] rounded-full bg-brand-200/50 blur-[120px]" />
        <div className="lp-drift absolute top-20 right-[-6%] size-[420px] rounded-full bg-saffron/15 blur-[120px]" style={{ animationDelay: "-9s" }} />
      </div>

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-10">
        <div className="max-w-[560px]">
          <p className="lp-rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pr-3 pl-1 text-[12.5px] font-medium text-ink-2 shadow-card backdrop-blur" style={rise(0)}>
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">POS</span>
            Billing · Kitchen · Stock · Reports — built for India
          </p>

          <h1 className="lp-rise mt-6 text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] text-ink sm:text-[52px] lg:text-[58px]" style={rise(80)}>
            Run the whole restaurant
            <span className={`${displayFont.className} block font-normal tracking-[-0.01em] text-brand-500 italic`}>from one screen.</span>
          </h1>

          <p className="lp-rise mt-5 text-[17px] text-ink-2" style={rise(160)}>
            Made for{" "}
            <RotatingWords
              className="font-semibold text-ink"
              words={["busy cafés", "quick-service counters", "fine-dining rooms", "cloud kitchens", "bars & lounges", "bakeries"]}
            />
          </p>

          <p className="lp-rise mt-4 text-[15.5px] leading-relaxed text-muted" style={rise(220)}>
            The counter, the kitchen and the books in one system: bill in seconds with UPI, card or split payments, send KOTs to the right station,
            deduct stock straight from your recipes and close the day with GST-ready reports.
          </p>

          <div className="lp-rise mt-8 flex flex-wrap items-center gap-3" style={rise(300)}>
            <Button size="lg" asChild className="lp-sheen">
              <a href="#demo">
                Book a free demo <ArrowRight />
              </a>
            </Button>
            {signupEnabled ? (
              <Button size="lg" variant="outline" asChild>
                <Link href="/auth/signup">Start {trialDays}-day free trial</Link>
              </Button>
            ) : (
              <SignInButton size="lg" variant="outline" />
            )}
          </div>
          <p className="lp-rise mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted" style={rise(360)}>
            <a href="#tour" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand-600">
              <CirclePlay className="size-4 text-brand-500" /> Watch the product tour
            </a>
            <span aria-hidden className="hidden h-3.5 w-px bg-line-strong sm:block" />
            <span>
              Already on Tabla?{" "}
              <SignInButton variant="ghost" size="sm" className="h-auto px-1 py-0 font-semibold text-brand-600 hover:bg-transparent hover:text-brand-700">Sign in here</SignInButton>
            </span>
          </p>

          <ul className="lp-rise mt-8 grid gap-2.5 text-[13.5px] text-ink-2 sm:grid-cols-2" style={rise(420)}>
            {["UPI QR, card & split bills", "80 mm & 58 mm thermal printing", "Recipe-based stock deduction", "Role-based logins for every staff"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-mint/15 text-mint">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative lg:-mr-16 xl:-mr-28">
          <HeroVisual pos={posShot} phone={overviewMobile} />
        </div>
      </div>
    </section>
  );
}

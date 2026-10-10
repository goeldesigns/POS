import { CalendarDays, CircleCheckBig, Database, Fingerprint, GraduationCap, KeyRound, ScrollText, Settings2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import activityShot from "../../../public/landing/activity.webp";
import { displayFont } from "./fonts";
import { BrowserFrame } from "./frames";
import { CountUp, Reveal } from "./motion";

export function SectionHeading({
  eyebrow,
  title,
  accent,
  text,
  align = "center",
  dark,
  id,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  text?: string;
  align?: "center" | "left";
  dark?: boolean;
  id?: string;
}) {
  return (
    <div className={cn("max-w-[720px]", align === "center" && "mx-auto text-center")}>
      <Reveal anim="fade">
        <p className={cn("text-[12.5px] font-semibold tracking-[0.14em] uppercase", dark ? "text-brand-300" : "text-brand-500")}>{eyebrow}</p>
      </Reveal>
      <Reveal anim="blur" delay={80}>
        <h2 id={id} className={cn("mt-3 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[42px]", dark ? "text-white" : "text-ink")}>
          {title}
          {accent ? (
            <>
              {" "}
              <span className={cn(displayFont.className, "font-normal tracking-[-0.01em] whitespace-nowrap italic", dark ? "text-brand-300" : "text-brand-500")}>{accent}</span>
            </>
          ) : null}
        </h2>
      </Reveal>
      {text ? (
        <Reveal anim="up" delay={160}>
          <p className={cn("mt-4 text-[16px] leading-relaxed", dark ? "text-white/65" : "text-muted")}>{text}</p>
        </Reveal>
      ) : null}
    </div>
  );
}

// ─── How it works ───────────────────────────────────────────────────────────

const STEPS = [
  { icon: CalendarDays, tone: "bg-brand-500", title: "Book a 30-minute demo", text: "Pick a slot below. We walk through billing, KOTs and reports on a menu like yours." },
  { icon: Settings2, tone: "bg-saffron", title: "We set up your outlet", text: "Send us your menu and we load items, taxes, tables, printers and staff logins with you." },
  { icon: GraduationCap, tone: "bg-mint", title: "Train the team", text: "Everyone gets their own login and sees only the screens their role needs." },
  { icon: CircleCheckBig, tone: "bg-ocean", title: "Go live", text: "Take your first order and watch sales, stock and reports update as you serve." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-24 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From first call to first bill," accent="without the fuss." text="Nothing to install. Tabla runs in the browser on the laptops, tablets and printers you already own." />

        <Reveal anim="fade" className="relative mt-16">
          {/* Connector drawn as the section comes into view (desktop) */}
          <svg className="absolute top-7 right-[12.5%] left-[12.5%] hidden h-2 w-[75%] lg:block" viewBox="0 0 900 8" preserveAspectRatio="none" aria-hidden>
            <path d="M0 4 H900" stroke="var(--color-line-strong)" strokeWidth="2" strokeDasharray="4 6" fill="none" />
            <path className="lp-draw" d="M0 4 H900" stroke="var(--color-brand-500)" strokeWidth="2" fill="none" style={{ "--lp-len": 900 } as React.CSSProperties} />
          </svg>
          <ol className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} anim="up" delay={200 + i * 260} className="text-center">
                <span className={cn("relative mx-auto grid size-14 place-items-center rounded-2xl text-white shadow-raised ring-8 ring-surface", s.tone)}>
                  <s.icon className="size-6" />
                  <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-surface text-[12px] font-semibold text-ink shadow-card ring-1 ring-line">{i + 1}</span>
                </span>
                <h3 className="mt-5 text-[16px] font-semibold text-ink">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-[260px] text-[14px] leading-relaxed text-muted">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Product facts (real numbers about the product, not customer claims) ────

const FACTS = [
  { value: 16, label: "modules in one system", tone: "text-brand-500" },
  { value: 13, label: "ready-made reports, CSV & PDF", tone: "text-saffron" },
  { value: 7, label: "staff roles out of the box", tone: "text-mint" },
  { value: 4, label: "order types in one kitchen queue", tone: "text-ocean" },
];

export function FactsBand() {
  return (
    <section aria-label="Product facts" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 divide-line px-4 sm:px-6 lg:grid-cols-4 lg:divide-x">
        {FACTS.map((f, i) => (
          <Reveal key={f.label} anim="scale" delay={i * 90} className="px-4 py-9 text-center lg:py-11">
            <p className={cn("text-[44px] leading-none font-semibold tracking-[-0.04em] sm:text-[52px]", f.tone)}>
              <CountUp value={f.value} duration={1200 + i * 150} />
            </p>
            <p className="mt-2 text-[13.5px] text-muted">{f.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─── Security ───────────────────────────────────────────────────────────────

const SAFEGUARDS = [
  { icon: Database, title: "Each restaurant's data is isolated", text: "Orders, customers and stock are separated per outlet at the database layer — not just hidden in the interface." },
  { icon: KeyRound, title: "Permissions per person, per action", text: "Decide who can bill, discount, refund, void or see reports. Changes apply on the next click." },
  { icon: ScrollText, title: "A trail for every sensitive action", text: "Voids, refunds, discounts, stock adjustments and permission changes are logged with who, when and from where." },
  { icon: Fingerprint, title: "Secure by default", text: "Passwords are hashed, sessions expire, and aggregator credentials are encrypted at rest." },
];

export function Security() {
  return (
    <section className="relative overflow-hidden bg-night py-24 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }}
        aria-hidden
      />
      <div className="lp-drift pointer-events-none absolute -right-40 -bottom-40 size-[560px] rounded-full bg-brand-500/25 blur-[140px]" aria-hidden />
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <SectionHeading
            dark
            align="left"
            eyebrow="Control & security"
            title="Know who did what,"
            accent="every shift."
            text="Cash counters run on trust. Tabla backs it up with role-based access and an activity log owners actually read."
          />
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {SAFEGUARDS.map((s, i) => (
              <Reveal as="li" key={s.title} anim="left" delay={i * 110}>
                <span className="grid size-10 place-items-center rounded-xl bg-white/[0.07] text-brand-300 ring-1 ring-white/10">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-3 text-[15px] font-semibold text-white">{s.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">{s.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal anim="clip" delay={150}>
          <BrowserFrame label="Tabla · Staff activity log" dark>
            <Image src={activityShot} alt="Staff activity log listing sign-ins, payments, purchases and orders with names, roles and times" sizes="(min-width: 1024px) 640px, 100vw" className="h-auto w-full" placeholder="blur" />
          </BrowserFrame>
        </Reveal>
      </div>
    </section>
  );
}

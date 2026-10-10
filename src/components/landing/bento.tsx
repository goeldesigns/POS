"use client";

import { Check, Clock, Gift, KeyRound, Printer, ShoppingBag, UserCheck, UserMinus, Users, Utensils, Wallet, Globe, Bike, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { CountUp, Reveal, SpotCard, useInView } from "./motion";

function Card({
  className,
  tone,
  icon: Icon,
  title,
  text,
  children,
  delay = 0,
  wide,
}: {
  className?: string;
  tone: string;
  icon: LucideIcon;
  title: string;
  text: string;
  children: React.ReactNode;
  delay?: number;
  /** Full-width card with the demo beside the copy on large screens. */
  wide?: boolean;
}) {
  return (
    <Reveal anim="up" delay={delay} loop className={className}>
      <SpotCard className={cn("lp-lift flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-surface", wide && "lg:flex-row")}>
        <div className={cn("relative min-h-[190px] flex-1 overflow-hidden border-b border-line bg-canvas", wide && "lg:min-h-[200px] lg:max-w-[560px] lg:border-r lg:border-b-0")}>{children}</div>
        <div className={cn("p-5", wide && "lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-10")}>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span className={cn("grid size-7 place-items-center rounded-lg", tone)}>
              <Icon className="size-4" />
            </span>
            {title}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{text}</p>
        </div>
      </SpotCard>
    </Reveal>
  );
}

/** Thermal receipt sliding out of a printer slot, on a loop. */
function ReceiptDemo() {
  return (
    <div className="absolute inset-0 flex justify-center bg-night pt-10">
      <div className="absolute top-6 h-4 w-[230px] rounded-full bg-night-3 shadow-[inset_0_2px_4px_rgb(0_0_0/0.5)]" aria-hidden />
      <div className="relative h-full w-[200px] overflow-hidden pt-2">
        <div className="lp-print rounded-b-md bg-white px-4 pt-4 pb-6 font-mono text-[10.5px] leading-[1.55] text-[#222] shadow-xl" style={{ backgroundImage: "radial-gradient(circle at 6px -2px, transparent 6px, white 6.5px)", backgroundSize: "12px 100%", backgroundPosition: "bottom", backgroundRepeat: "repeat-x" }}>
          <p className="text-center text-[12px] font-bold">SPICE &amp; STONE</p>
          <p className="text-center text-[9.5px] text-[#666]">GSTIN 29AAKFS4821R1Z6</p>
          <p className="my-1.5 border-t border-dashed border-[#999]" />
          <p className="flex justify-between"><span>ORD-4941 · T05</span><span>7:42 PM</span></p>
          <p className="my-1.5 border-t border-dashed border-[#999]" />
          {[
            ["2 Paneer Tikka", "658.00"],
            ["1 Dal Makhani", "299.00"],
            ["4 Butter Naan", "236.00"],
          ].map(([a, b]) => (
            <p key={a} className="flex justify-between"><span>{a}</span><span>{b}</span></p>
          ))}
          <p className="flex justify-between text-[#666]"><span>CGST 2.5%</span><span>29.83</span></p>
          <p className="flex justify-between text-[#666]"><span>SGST 2.5%</span><span>29.83</span></p>
          <p className="my-1.5 border-t border-dashed border-[#999]" />
          <p className="flex justify-between text-[12px] font-bold"><span>TOTAL</span><span>₹1,253</span></p>
          <p className="mt-1 flex justify-between"><span>Paid · UPI</span><span>₹1,253</span></p>
          <p className="mt-2 text-center text-[9.5px] text-[#666]">Thank you for dining with us!</p>
        </div>
      </div>
    </div>
  );
}

const SOURCES: { label: string; icon: LucideIcon; tone: string; detail: string }[] = [
  { label: "Counter", icon: Utensils, tone: "bg-brand-100 text-brand-600", detail: "T03 · 4 items" },
  { label: "Website", icon: Globe, tone: "bg-ocean/12 text-ocean", detail: "Delivery · prepaid" },
  { label: "Takeaway", icon: ShoppingBag, tone: "bg-mint/12 text-mint", detail: "Pickup in 15 min" },
  { label: "Aggregator", icon: Bike, tone: "bg-saffron/12 text-saffron", detail: "Delivery · 3 items" },
];

/** Orders from every channel dropping into one kitchen queue. */
function QueueDemo() {
  const [n, setN] = React.useState(4);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setN((x) => x + 1), 2200);
    return () => clearInterval(id);
  }, []);
  const items = [0, 1, 2, 3].map((i) => n - i).filter((x) => x >= 0);
  return (
    <div className="absolute inset-0 px-5 pt-5">
      <p className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wide text-muted uppercase">
        <span>New tickets</span>
        <span className="tabular rounded-full bg-surface px-2 py-0.5 text-ink ring-1 ring-line">#{4930 + n}</span>
      </p>
      <ul className="space-y-1.5">
        {items.map((k, i) => {
          const s = SOURCES[k % SOURCES.length]!;
          const Icon = s.icon;
          return (
            <li key={k} className={cn("flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 shadow-card", i === 0 && "lp-ticket-in")} style={{ opacity: 1 - i * 0.2 }}>
              <span className={cn("grid size-7 place-items-center rounded-lg", s.tone)}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-ink">ORD-{4930 + k}</span>
                <span className="block truncate text-[11px] text-muted">
                  {s.label} · {s.detail}
                </span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted tabular">
                <Clock className="size-3" /> {i * 2 + 1}m
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Advances 0…count-1 every `ms` once the demo is on screen; stays put for reduced motion. */
function useLoopStep<T extends Element>(ref: React.RefObject<T | null>, ms: number, count: number) {
  const inView = useInView(ref);
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (!inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((x) => (x + 1) % count), ms);
    return () => clearInterval(id);
  }, [inView, ms, count]);
  return { step, inView };
}

/** Eases a number to each new target (from 0 the first time). */
function useTween(target: number, duration = 800) {
  const [value, setValue] = React.useState(0);
  const from = React.useRef(0);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - t, 3)));
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

const MATRIX: { role: string; cells: boolean[] }[] = [
  { role: "Owner", cells: [true, true, true, true] },
  { role: "Manager", cells: [true, true, true, false] },
  { role: "Cashier", cells: [true, true, false, false] },
  { role: "Waiter", cells: [true, false, false, false] },
  { role: "Kitchen", cells: [false, false, false, false] },
];

/** Per-person changes on top of a role: granted, then back to the role default. */
const GRANTS = [
  { row: 2, col: 2, who: "Rahul S.", what: "can refund" },
  { row: 3, col: 1, who: "Vikram S.", what: "can give discounts" },
  { row: 1, col: 3, who: "Neha V.", what: "can see reports" },
];

/** Permission matrix where per-person grants switch on and off, one at a time. */
function MatrixDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const { step } = useLoopStep(ref, 1700, GRANTS.length * 2);
  const grant = GRANTS[Math.floor(step / 2)]!;
  const granted = step % 2 === 0;
  return (
    <div ref={ref} className="absolute inset-0 px-5 pt-4">
      <div className="overflow-hidden rounded-xl border border-line bg-surface text-[11.5px] shadow-card">
        <div className="grid grid-cols-[1.3fr_repeat(4,1fr)] border-b border-line bg-canvas/80 px-3 py-1 font-medium text-muted">
          <span>Role</span>
          {["Bill", "Discount", "Refund", "Reports"].map((c) => (
            <span key={c} className="text-center">{c}</span>
          ))}
        </div>
        {MATRIX.map((row, r) => (
          <div
            key={row.role}
            className={cn("grid grid-cols-[1.3fr_repeat(4,1fr)] items-center border-b border-line px-3 py-1 transition-colors duration-500 last:border-b-0", r === grant.row && "bg-brand-50")}
          >
            <span className="font-medium text-ink">{row.role}</span>
            {row.cells.map((on, c) => {
              const target = r === grant.row && c === grant.col;
              const extra = target && granted;
              return (
                <span key={c} className="flex justify-center">
                  {/* The ring and the pop live on separate elements so both animations play. */}
                  <span key={target ? `cell-${step}` : "cell"} className={cn("grid rounded-[5px]", target && "lp-ring")}>
                    {on || extra ? (
                      <span
                        className={cn("lp-pop grid size-4 place-items-center rounded-[5px] text-white", extra ? "bg-mint" : "bg-brand-500")}
                        style={{ "--lp-delay": extra ? "0ms" : `${300 + (r * 4 + c) * 70}ms` } as React.CSSProperties}
                      >
                        <Check className="size-3" strokeWidth={3.5} />
                      </span>
                    ) : (
                      <span className="size-4 rounded-[5px] border border-line-strong" />
                    )}
                  </span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p
        key={step}
        className="lp-toast absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-night px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-white shadow-pop"
      >
        {granted ? <UserCheck className="size-3.5 text-mint" /> : <UserMinus className="size-3.5 text-white/60" />}
        {granted ? `${grant.who} ${grant.what}` : `${grant.who} · back to ${MATRIX[grant.row]!.role} defaults`}
      </p>
    </div>
  );
}

/** Money in and out over the month. Sums to zero so the loop is seamless. */
const LEDGER = [
  { label: "Dinner sales", amount: 38_420 },
  { label: "Kaveri Dairy bill", amount: -12_680 },
  { label: "Lunch sales", amount: 26_150 },
  { label: "Electricity", amount: -8_940 },
  { label: "Swiggy payout", amount: 18_300 },
  { label: "Staff salaries", amount: -41_000 },
  { label: "Rent", amount: -20_250 },
];
const FOOD_COST = [29.4, 28.9, 29.6, 29.1, 29.3, 28.8, 29.5];
const BASE_PROFIT = 184_260;

/** Net profit that moves with each ledger entry; this month's bar rises and falls with it. */
function ExpenseDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const { step, inView } = useLoopStep(ref, 2200, LEDGER.length);
  const profit = BASE_PROFIT + LEDGER.slice(0, step).reduce((a, e) => a + e.amount, 0);
  const shown = useTween(inView ? profit : 0);
  const entry = LEDGER[(step + LEDGER.length - 1) % LEDGER.length]!;
  const bars = [62, 48, 74, 55, 88, 70];
  const current = Math.min(100, Math.max(70, 70 + ((profit - 170_000) / 80_000) * 30));
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col px-5 pt-5 pb-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Net profit · this month</p>
          <p className="tabular text-[22px] font-semibold tracking-[-0.02em] text-ink">₹{shown.toLocaleString("en-IN")}</p>
        </div>
        <span className="tabular rounded-full bg-mint/12 px-2 py-0.5 text-[11px] font-semibold text-mint">Food cost {FOOD_COST[step]!.toFixed(1)}%</span>
      </div>
      {step > 0 ? (
        <p key={step} className="lp-float-up absolute top-[50px] right-5 text-right text-[11px] leading-tight">
          <span className={cn("tabular block text-[13px] font-semibold", entry.amount > 0 ? "text-mint" : "text-danger-700")}>
            {entry.amount > 0 ? "+" : "−"}₹{Math.abs(entry.amount).toLocaleString("en-IN")}
          </span>
          <span className="text-muted">{entry.label}</span>
        </p>
      ) : null}
      <div className="mt-auto flex h-[88px] items-end gap-2">
        {bars.map((h, i) => (
          <span key={i} className="lp-bar flex-1 rounded-t-[4px] bg-line-strong" style={{ height: `${h}%`, "--lp-delay": `${i * 90}ms` } as React.CSSProperties} />
        ))}
        <span className="lp-bar flex-1 rounded-t-[4px] bg-mint transition-[height] duration-700 ease-out" style={{ height: `${current}%`, "--lp-delay": "540ms" } as React.CSSProperties} />
      </div>
    </div>
  );
}

type Shift = "On shift" | "Late" | "Break";
const SHIFT_TONE: Record<Shift, string> = {
  "On shift": "bg-mint/12 text-mint",
  Late: "bg-turmeric/15 text-[#b77c00]",
  Break: "bg-ocean/12 text-ocean",
};
const STAFF = [
  { name: "Rahul S.", role: "Cashier", time: "9:58 AM" },
  { name: "Neha V.", role: "Manager", time: "10:02 AM" },
  { name: "Vikram S.", role: "Waiter", time: "10:24 AM" },
  { name: "Sunita R.", role: "Kitchen", time: "10:05 AM" },
];
/** The day moving on: Vikram clocks in late, Neha takes a break, then Sunita. */
const ROSTER: Shift[][] = [
  ["On shift", "On shift", "Late", "On shift"],
  ["On shift", "On shift", "On shift", "On shift"],
  ["On shift", "Break", "On shift", "On shift"],
  ["On shift", "On shift", "On shift", "Break"],
];

/** Live attendance: statuses change in place, shift time keeps filling up. */
function StaffDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const { step } = useLoopStep(ref, 2400, ROSTER.length);
  const now = ROSTER[step]!;
  const before = ROSTER[(step + ROSTER.length - 1) % ROSTER.length]!;
  const onShift = now.filter((s) => s === "On shift").length;
  return (
    <div ref={ref} className="absolute inset-0 px-5 pt-4">
      <p className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-wide text-muted uppercase">
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="lp-ping absolute inset-0 rounded-full bg-mint" />
            <span className="relative size-2 rounded-full bg-mint" />
          </span>
          Live attendance
        </span>
        <span className="tabular rounded-full bg-surface px-2 py-0.5 text-ink normal-case ring-1 ring-line">
          {onShift} of {STAFF.length} on shift
        </span>
      </p>
      <ul className="lp-stagger space-y-1.5">
        {STAFF.map((p, i) => {
          const status = now[i]!;
          const changed = step > 0 && status !== before[i];
          return (
            <li
              key={`${p.name}-${changed ? step : "same"}`}
              className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-line bg-surface px-3 py-2 shadow-card"
              style={{ animationDelay: changed ? "0ms" : `${300 + i * 140}ms` }}
            >
              {changed ? <span aria-hidden className="lp-flash pointer-events-none absolute inset-0 bg-brand-100 mix-blend-multiply" /> : null}
              <span className="relative grid size-7 place-items-center rounded-full bg-sunken text-[10.5px] font-semibold text-ink-2">
                {changed ? <span className="lp-ping absolute inset-0 rounded-full bg-brand-200" /> : null}
                <span className="relative">{p.name.split(" ").map((x) => x[0]).join("")}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-ink">{p.name}</span>
                <span className="block text-[11px] text-muted">
                  {p.role} · {status === "Late" ? "due 10:00 AM" : `in ${p.time}`}
                </span>
              </span>
              <span key={status} className={cn("lp-pop rounded-full px-2 py-0.5 text-[10.5px] font-semibold", SHIFT_TONE[status])}>
                {status}
              </span>
              {status !== "Late" ? (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-sunken">
                  <span className={cn("lp-fill block h-full", status === "Break" ? "bg-ocean/60" : "bg-mint/70")} style={{ animationDelay: `-${i * 2.3}s` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LoyaltyStockDemo() {
  return (
    <div className="absolute inset-0 grid grid-rows-2 gap-3 px-5 pt-5 pb-4">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 shadow-card">
        <span className="grid size-9 place-items-center rounded-xl bg-blush/15 text-[#c4507d]">
          <Gift className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted">Farah K. · Gold member</span>
          <span className="block text-[17px] font-semibold text-ink">
            <CountUp value={5449} suffix=" pts" duration={1800} />
          </span>
        </span>
        <span className="text-right text-[11px] text-muted">
          worth
          <span className="block text-[13px] font-semibold text-ink">₹1,362</span>
        </span>
      </div>
      <div className="flex flex-col justify-center rounded-xl border border-line bg-surface px-3.5 shadow-card">
        <p className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-ink">Paneer</span>
          <span className="text-muted">auto-deducted per plate</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
          <div className="lp-drain lp-drain-color h-full rounded-full" />
        </div>
        <p className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>Reorder at 3 kg</span>
          <span>Purchase received → topped up</span>
        </p>
      </div>
    </div>
  );
}

export function BackOfficeGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card
        className="md:row-span-2"
        tone="bg-turmeric/15 text-[#b77c00]"
        icon={Printer}
        title="Prints where it's needed"
        text="KOTs go to the right kitchen station; GST receipts print on 80 mm or 58 mm thermal printers straight from the browser — no plugin or desktop app needed."
      >
        <ReceiptDemo />
      </Card>
      <Card tone="bg-brand-100 text-brand-600" icon={Utensils} title="Every channel, one queue" text="Counter, takeaway, website and aggregator orders share one kitchen queue and one set of reports." delay={80}>
        <QueueDemo />
      </Card>
      <Card tone="bg-brand-100 text-brand-600" icon={KeyRound} title="Access you control" text="Seven ready-made roles, plus per-person changes. A waiter can't refund; a cashier can't see your P&L." delay={160}>
        <MatrixDemo />
      </Card>
      <Card tone="bg-mint/12 text-mint" icon={Wallet} title="Expenses & profit" text="Log rent, salaries and supplier bills next to sales, and see food cost and profit without a spreadsheet." delay={80}>
        <ExpenseDemo />
      </Card>
      <Card tone="bg-ocean/12 text-ocean" icon={Users} title="Staff & attendance" text="Clock-ins, shifts and performance per person — and every login is tied to a name." delay={160}>
        <StaffDemo />
      </Card>
      <Card
        wide
        className="md:col-span-2 lg:col-span-3"
        tone="bg-blush/15 text-[#c4507d]"
        icon={Gift}
        title="Loyalty & stock, automatic"
        text="Points are earned and redeemed at the counter, with a welcome bonus and birthday rewards. Recipes deduct ingredients the moment a bill is settled, and a received purchase tops stock back up."
        delay={120}
      >
        <LoyaltyStockDemo />
      </Card>
    </div>
  );
}

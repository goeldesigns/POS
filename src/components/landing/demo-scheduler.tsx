"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CalendarPlus, ChevronLeft, ChevronRight, Clock, Minus, Moon, Plus, Sun, Sunrise } from "lucide-react";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { DEMO, demoInstant, formatDemoDate, formatSlot, type DemoDay } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { demoRequestSchema } from "@/lib/validation/demo";
import { RESTAURANT_TYPES } from "@/lib/validation/platform";
import { demoAvailabilityAction, requestDemoAction } from "@/server/actions/demo";

type FormInput = z.input<typeof demoRequestSchema>;
type Booked = { scheduledAt: string; date: string; time: string; email: string; name: string; restaurantName: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PERIODS = [
  { key: "morning", label: "Morning", icon: Sunrise, test: (t: string) => t < "12:00" },
  { key: "afternoon", label: "Afternoon", icon: Sun, test: (t: string) => t >= "12:00" && t < "16:00" },
  { key: "evening", label: "Evening", icon: Moon, test: (t: string) => t >= "16:00" },
];

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

function icsFile(b: Booked) {
  const start = new Date(b.scheduledAt);
  const end = new Date(start.getTime() + DEMO.durationMinutes * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tabla//Demo booking//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(start)}-${b.email.replace(/[^a-z0-9]/gi, "")}@tabla`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Tabla POS demo — ${b.restaurantName}`,
    "DESCRIPTION:A product specialist will call to confirm and share the meeting link.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function DemoScheduler({ initialDays }: { initialDays: DemoDay[] }) {
  const [days, setDays] = React.useState(initialDays);
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const firstOpen = days.find((d) => d.slots.some((s) => s.remaining > 0))?.date ?? days[0]?.date ?? "";
  const [date, setDate] = React.useState<string>(firstOpen);
  const [time, setTime] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(monthKey(firstOpen));
  const [notice, setNotice] = React.useState<string | null>(null);
  const [booked, setBooked] = React.useState<Booked | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Steps change the card height; keep its top in view so nothing jumps away.
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el || step === 1) return;
    const top = el.getBoundingClientRect().top;
    if (top < 72) window.scrollBy({ top: top - 96, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step]);

  const byDate = React.useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const firstMonth = monthKey(days[0]?.date ?? firstOpen);
  const lastMonth = monthKey(days[days.length - 1]?.date ?? firstOpen);
  const selectedDay = byDate.get(date);

  const refresh = async () => {
    const res = await demoAvailabilityAction({});
    if (res.ok) setDays(res.data);
  };

  return (
    <div ref={cardRef} className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_30px_70px_-30px_rgb(36_28_110/0.35)]">
      {/* Steps */}
      <div className="border-b border-line px-4 pt-5 pb-4 sm:px-7">
        <ol className="flex items-center gap-3 text-[12.5px] font-medium">
          {["Pick a time", "Your details", "Confirmed"].map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const done = step > n;
            const current = step === n;
            return (
              <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold transition-colors duration-300",
                    done ? "bg-mint text-white" : current ? "bg-brand-500 text-white" : "bg-sunken text-muted",
                  )}
                >
                  {done ? "✓" : n}
                </span>
                <span className={cn("truncate transition-colors", current ? "text-ink" : "text-muted max-sm:hidden")}>{label}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      {step === 1 ? (
        <div key="step1" className="lp-step-in p-4 sm:p-7">
          {notice ? (
            <InlineAlert tone="warning" className="mb-4">
              {notice}
            </InlineAlert>
          ) : null}
          <div className="grid grid-cols-1 gap-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Calendar */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[15px] font-semibold text-ink">
                  {new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= lastMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center sm:gap-1">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                    {w}
                  </span>
                ))}
                {monthGrid(month).map((d, i) => {
                  if (!d) return <span key={`empty-${i}`} />;
                  const info = byDate.get(d);
                  const open = info ? info.slots.filter((s) => s.remaining > 0).length : 0;
                  const disabled = !info || open === 0;
                  const selected = d === date;
                  const isToday = d === days[0]?.date;
                  return (
                    <button
                      suppressHydrationWarning
                      key={d}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setDate(d);
                        setTime(null);
                        setNotice(null);
                      }}
                      aria-pressed={selected}
                      aria-label={`${formatDemoDate(d)}${disabled ? " — unavailable" : ` — ${open} times available`}`}
                      className={cn(
                        "relative grid aspect-square min-w-0 place-items-center rounded-xl text-[13.5px] font-medium transition-all duration-200",
                        disabled ? "cursor-not-allowed text-subtle/60" : "text-ink hover:bg-brand-50",
                        selected && "scale-105 bg-brand-500 text-white shadow-[0_6px_16px_-4px_rgb(80_64_208/0.6)] hover:bg-brand-500",
                        isToday && !selected && "ring-1 ring-line-strong",
                      )}
                    >
                      {Number(d.slice(8))}
                      {!disabled ? (
                        <span
                          className={cn("absolute bottom-1.5 size-1 rounded-full", selected ? "bg-white" : open <= 4 ? "bg-turmeric" : "bg-mint")}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-mint" /> Plenty of times
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-turmeric" /> Filling up
                </span>
                <span>Mon–Sat</span>
              </p>
            </div>

            {/* Slots */}
            <div className="min-w-0">
              <p className="mb-3 flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">{date ? formatDemoDate(date) : "Choose a date"}</span>
                <span className="text-[12px] text-muted">
                  {DEMO.durationMinutes} min · {DEMO.timezoneLabel}
                </span>
              </p>
              <div key={date} className="max-h-[300px] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
                {PERIODS.map((period) => {
                  const slots = (selectedDay?.slots ?? []).filter((s) => period.test(s.time));
                  if (!slots.length) return null;
                  return (
                    <div key={period.key}>
                      <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-subtle uppercase">
                        <period.icon className="size-3.5" /> {period.label}
                      </p>
                      <div className="lp-stagger grid grid-cols-3 gap-2">
                        {slots.map((s) => {
                          const full = s.remaining === 0;
                          const selected = s.time === time;
                          return (
                            <button
                              suppressHydrationWarning
                              key={s.time}
                              type="button"
                              disabled={full}
                              onClick={() => setTime(s.time)}
                              aria-pressed={selected}
                              className={cn(
                                "relative rounded-xl border px-2 py-2 text-[13px] font-semibold tabular transition-all duration-200",
                                full
                                  ? "cursor-not-allowed border-line bg-canvas text-subtle line-through"
                                  : selected
                                    ? "border-brand-500 bg-brand-500 text-white shadow-[0_6px_16px_-6px_rgb(80_64_208/0.6)]"
                                    : "border-line text-ink hover:border-brand-300 hover:bg-brand-50",
                              )}
                            >
                              {formatSlot(s.time)}
                              {s.remaining === 1 && !selected ? (
                                <span className="absolute -top-2 right-1.5 rounded-full bg-turmeric px-1.5 text-[9.5px] leading-4 font-bold text-white no-underline">1 left</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {selectedDay && !selectedDay.slots.length ? <p className="text-[13px] text-muted">No times left on this day — try another date.</p> : null}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <Clock className="size-4 text-brand-500" />
              {time ? (
                <span>
                  <span className="font-semibold text-ink">
                    {formatDemoDate(date)} · {formatSlot(time)}
                  </span>{" "}
                  {DEMO.timezoneLabel}
                </span>
              ) : (
                <span className="text-muted">Pick a date, then a time</span>
              )}
            </p>
            <Button size="lg" disabled={!time} onClick={() => setStep(2)}>
              Continue <ArrowRight />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 && time ? (
        <DetailsStep
          date={date}
          time={time}
          onBack={() => setStep(1)}
          onBooked={(b) => {
            setBooked(b);
            setStep(3);
          }}
          onSlotTaken={async (message) => {
            setNotice(message);
            setTime(null);
            setStep(1);
            await refresh();
          }}
        />
      ) : null}

      {step === 3 && booked ? <Confirmation booked={booked} /> : null}
    </div>
  );
}

function DetailsStep({
  date,
  time,
  onBack,
  onBooked,
  onSlotTaken,
}: {
  date: string;
  time: string;
  onBack: () => void;
  onBooked: (b: Booked) => void;
  onSlotTaken: (message: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormInput, unknown, z.output<typeof demoRequestSchema>>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      date,
      time,
      name: "",
      email: "",
      phone: "",
      restaurantName: "",
      city: "",
      outlets: "1",
      restaurantType: "",
      currentSystem: "",
      message: "",
      website: "",
    },
  });
  const { register, control, formState } = form;
  const err = (k: keyof FormInput) => formState.errors[k]?.message as string | undefined;

  const submit = form.handleSubmit(async () => {
    setError(null);
    const values = form.getValues();
    const result = await requestDemoAction(values);
    if (!result.ok) {
      if (result.code === "conflict" && /slot/i.test(result.error)) return onSlotTaken(result.error);
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) form.setError(name as keyof FormInput, { type: "server", message: messages[0] });
        }
      }
      setError(result.error);
      return;
    }
    onBooked({ scheduledAt: result.data.scheduledAt, date, time, email: String(values.email), name: String(values.name), restaurantName: String(values.restaurantName) });
  });

  return (
    <form key="step2" onSubmit={submit} noValidate className="lp-step-in p-4 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-150">
        <p className="flex items-center gap-2 text-[13.5px] text-ink">
          <Clock className="size-4 text-brand-500" />
          <span className="font-semibold">
            {formatDemoDate(date)} · {formatSlot(time)} {DEMO.timezoneLabel}
          </span>
          <span className="text-muted">· {DEMO.durationMinutes} min</span>
        </p>
        <button suppressHydrationWarning type="button" onClick={onBack} className="text-[13px] font-semibold text-brand-600 hover:underline">
          Change
        </button>
      </div>

      {error ? (
        <InlineAlert tone="danger" className="mb-4">
          {error}
        </InlineAlert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="demo-name" error={err("name")} required>
          <Input id="demo-name" autoComplete="name" placeholder="Kavya Menon" {...register("name")} invalid={!!err("name")} autoFocus />
        </Field>
        <Field label="Phone" htmlFor="demo-phone" error={err("phone")} required>
          <Input id="demo-phone" type="tel" autoComplete="tel" placeholder="+91 98450 12345" {...register("phone")} invalid={!!err("phone")} />
        </Field>
        <Field label="Work email" htmlFor="demo-email" error={err("email")} required className="sm:col-span-2">
          <Input id="demo-email" type="email" autoComplete="email" placeholder="you@restaurant.com" {...register("email")} invalid={!!err("email")} />
        </Field>
        <Field label="Restaurant name" htmlFor="demo-restaurant" error={err("restaurantName")} required>
          <Input id="demo-restaurant" autoComplete="organization" placeholder="e.g. Coastal Curry Co." {...register("restaurantName")} invalid={!!err("restaurantName")} />
        </Field>
        <Field label="City" htmlFor="demo-city" error={err("city")} optional>
          <Input id="demo-city" autoComplete="address-level2" placeholder="Kochi" {...register("city")} />
        </Field>
        <Field label="Type" htmlFor="demo-type" optional>
          <NativeSelect id="demo-type" {...register("restaurantType")}>
            <option value="">Choose…</option>
            {RESTAURANT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Outlets" htmlFor="demo-outlets" error={err("outlets")}>
          <Controller
            control={control}
            name="outlets"
            render={({ field }) => {
              const n = Math.max(1, Number(field.value) || 1);
              return (
                <div className="flex h-9 items-center rounded-lg border border-line bg-surface shadow-card">
                  <button suppressHydrationWarning type="button" aria-label="Fewer outlets" onClick={() => field.onChange(String(Math.max(1, n - 1)))} className="grid h-full w-10 place-items-center text-muted hover:text-ink">
                    <Minus className="size-4" />
                  </button>
                  <input
                    suppressHydrationWarning
                    id="demo-outlets"
                    inputMode="numeric"
                    value={field.value as string}
                    onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    className="h-full min-w-0 flex-1 bg-transparent text-center text-[14px] font-semibold text-ink outline-none tabular"
                  />
                  <button suppressHydrationWarning type="button" aria-label="More outlets" onClick={() => field.onChange(String(Math.min(500, n + 1)))} className="grid h-full w-10 place-items-center text-muted hover:text-ink">
                    <Plus className="size-4" />
                  </button>
                </div>
              );
            }}
          />
        </Field>
        <Field label="What do you use today?" htmlFor="demo-current" optional className="sm:col-span-2">
          <Input id="demo-current" placeholder="Another POS, billing software, a register book…" {...register("currentSystem")} />
        </Field>
        <Field label="Anything we should know?" htmlFor="demo-message" error={err("message")} optional className="sm:col-span-2">
          <Textarea id="demo-message" rows={3} placeholder="e.g. Two counters and a cloud kitchen, need KOTs for a tandoor station" {...register("message")} />
        </Field>
        {/* Honeypot for bots — hidden from people and assistive tech */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
          <label htmlFor="demo-website">Website</label>
          <input suppressHydrationWarning id="demo-website" tabIndex={-1} autoComplete="off" {...register("website")} />
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button type="submit" size="lg" loading={formState.isSubmitting} className="lp-sheen">
            Book my demo <ArrowRight />
          </Button>
          <p className="text-[11.5px] text-muted">We&apos;ll only use these details to arrange your demo.</p>
        </div>
      </div>
    </form>
  );
}

function Confirmation({ booked }: { booked: Booked }) {
  const download = () => {
    const blob = new Blob([icsFile(booked)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tabla-demo.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const local = new Date(demoInstant(booked.date, booked.time));
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showLocal = viewerTz && viewerTz !== DEMO.timezone && viewerTz !== "Asia/Calcutta";

  return (
    <div key="step3" className="lp-step-in px-5 py-10 text-center sm:px-10">
      <div className="relative mx-auto size-20">
        <span className="lp-burst absolute inset-0 rounded-full bg-mint/30" aria-hidden />
        <svg viewBox="0 0 80 80" className="relative size-20" aria-hidden>
          <circle cx="40" cy="40" r="36" fill="var(--color-mint)" />
          <path className="lp-tick" d="M26 41 l9 9 l19 -20" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="mt-6 text-[24px] font-semibold tracking-[-0.02em] text-ink">You&apos;re booked, {booked.name.split(" ")[0]}!</h3>
      <p className="mx-auto mt-2 max-w-[420px] text-[14.5px] leading-relaxed text-muted">
        Your demo for <span className="font-medium text-ink">{booked.restaurantName}</span> is on
      </p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-[15px] font-semibold text-brand-700 ring-1 ring-brand-150">
        <Clock className="size-4" />
        {formatDemoDate(booked.date, { year: true })} · {formatSlot(booked.time)} {DEMO.timezoneLabel}
      </p>
      {showLocal ? (
        <p className="mt-2 text-[12.5px] text-muted">
          That&apos;s {local.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} your time.
        </p>
      ) : null}
      <p className="mx-auto mt-5 max-w-[440px] text-[13.5px] leading-relaxed text-muted">
        We&apos;ve sent the details to <span className="font-medium text-ink">{booked.email}</span>. A product specialist will call to confirm and share the meeting link.
      </p>
      <div className="mt-7 flex justify-center">
        <Button variant="outline" onClick={download}>
          <CalendarPlus /> Add to calendar
        </Button>
      </div>
    </div>
  );
}

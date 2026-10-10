import { ChefHat, Layers, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/brand";

const POINTS = [
  { icon: Zap, title: "Billing in seconds", text: "Keyboard-first POS with split payments, KOTs and thermal receipts." },
  { icon: Layers, title: "Stock that follows the menu", text: "Recipes deduct ingredients the moment a bill is settled." },
  { icon: ChefHat, title: "One kitchen pipeline", text: "Dine-in, takeaway and aggregator orders in a single queue." },
  { icon: ShieldCheck, title: "Access you control", text: "Role-based permissions per person, per module." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/auth/login" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="text-xs text-subtle">
          © {new Date().getFullYear()} {BRAND.name}. Need help? <a className="text-muted hover:text-ink" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
        </p>
      </div>
      <aside className="relative hidden overflow-hidden bg-brand-500 lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 xl:px-20">
          <p className="text-xs font-medium tracking-[0.12em] text-white/60 uppercase">{BRAND.tagline}</p>
          <h2 className="mt-3 max-w-[440px] text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-white">
            Run the counter, the kitchen and the books from one place.
          </h2>
          <ul className="mt-10 grid max-w-[460px] gap-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
                  <p.icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{p.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/70">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

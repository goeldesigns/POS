import { ArrowRight, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { displayFont } from "./fonts";
import { Reveal } from "./motion";
import { SignInButton } from "./signin";

/** The demo, itemised like a bill — same agenda as the booking section. */
const DEMO_BILL = [
  { item: "Your outlet today", qty: "5 min" },
  { item: "Billing, KOTs & tables", qty: "15 min" },
  { item: "Stock, reports & access", qty: "10 min" },
];

export function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal anim="up" className="mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-night text-white">
        <div className="grid items-center gap-12 px-6 py-14 sm:px-12 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:py-20">
          <div>
            <p className="text-[13px] font-medium text-white/55">Ready when your kitchen is</p>
            <h2 className="mt-3 max-w-[560px] text-[34px] leading-[1.08] font-semibold tracking-[-0.03em] sm:text-[46px]">
              Your next service could run on <span className={`${displayFont.className} font-normal text-brand-200 italic`}>Tabla.</span>
            </h2>
            <p className="mt-4 max-w-[460px] text-[16px] leading-relaxed text-white/70">
              See it on a menu like yours in 30 minutes — billing, kitchen, stock and reports, end to end.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="bg-white text-night hover:bg-brand-50">
                <a href="#demo">
                  Book a free demo <ArrowRight />
                </a>
              </Button>
              <SignInButton size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                Sign in to your POS
              </SignInButton>
            </div>
            <p className="mt-6 text-[13px] text-white/45">Video call · Mon–Sat, 10 AM – 7 PM IST · no card needed</p>
          </div>

          {/* A printed bill for the demo itself. */}
          <Reveal anim="up" delay={150} className="mx-auto w-full max-w-[300px] lg:mr-0">
            <div
              className="-rotate-2 rounded-t-md bg-white px-5 pt-5 pb-8 font-mono text-[11.5px] leading-[1.7] text-[#2a2a2a] shadow-[0_24px_48px_-16px_rgb(0_0_0/0.55)] transition-transform duration-500 hover:rotate-0"
              style={{ backgroundImage: "radial-gradient(circle at 7px -3px, transparent 7px, white 7.5px)", backgroundSize: "14px 100%", backgroundPosition: "bottom", backgroundRepeat: "repeat-x" }}
            >
              <p className="text-center text-[13px] font-bold tracking-wide">TABLA DEMO</p>
              <p className="text-center text-[10.5px] text-[#777]">Table: yours · Server: product specialist</p>
              <p className="my-2 border-t border-dashed border-[#aaa]" />
              {DEMO_BILL.map((l) => (
                <p key={l.item} className="flex justify-between gap-3">
                  <span>{l.item}</span>
                  <span className="shrink-0">{l.qty}</span>
                </p>
              ))}
              <p className="my-2 border-t border-dashed border-[#aaa]" />
              <p className="flex justify-between font-bold">
                <span>TOTAL TIME</span>
                <span>30 min</span>
              </p>
              <p className="flex justify-between text-[13px] font-bold">
                <span>AMOUNT DUE</span>
                <span>₹0.00</span>
              </p>
              <p className="mt-3 text-center text-[10.5px] text-[#777]">Thank you — see you on the call!</p>
            </div>
          </Reveal>
        </div>
      </Reveal>
    </section>
  );
}

export function SiteFooter({ supportEmail, supportPhone, signupEnabled }: { supportEmail: string; supportPhone: string; signupEnabled: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-[300px] text-[13.5px] leading-relaxed text-muted">
            Point of sale, kitchen, inventory and back office for restaurants — in one system, in the browser.
          </p>
        </div>
        <nav aria-label="Product" className="text-[13.5px]">
          <p className="font-semibold text-ink">Product</p>
          <ul className="mt-3 space-y-2.5 text-muted">
            <li><a href="#features" className="hover:text-ink">Features</a></li>
            <li><a href="#how-it-works" className="hover:text-ink">How it works</a></li>
            <li><a href="#pricing" className="hover:text-ink">Pricing</a></li>
            <li><a href="#faq" className="hover:text-ink">FAQ</a></li>
          </ul>
        </nav>
        <nav aria-label="Account" className="text-[13.5px]">
          <p className="font-semibold text-ink">Account</p>
          <ul className="mt-3 space-y-2.5 text-muted">
            <li><SignInButton variant="ghost" size="sm" className="h-auto p-0 text-[13.5px] font-normal text-muted hover:bg-transparent hover:text-ink">Sign in</SignInButton></li>
            <li><a href="#demo" className="hover:text-ink">Book a demo</a></li>
            {signupEnabled ? <li><Link href="/auth/signup" className="hover:text-ink">Start a free trial</Link></li> : null}
            <li><Link href="/auth/forgot-password" className="hover:text-ink">Reset password</Link></li>
            <li><Link href="/super-admin/login" className="hover:text-ink">Platform console</Link></li>
          </ul>
        </nav>
        <div className="text-[13.5px]">
          <p className="font-semibold text-ink">Talk to us</p>
          <ul className="mt-3 space-y-2.5 text-muted">
            <li>
              <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-2 hover:text-ink">
                <Mail className="size-4" /> {supportEmail}
              </a>
            </li>
            {supportPhone ? (
              <li>
                <a href={`tel:${supportPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 hover:text-ink">
                  <Phone className="size-4" /> {supportPhone}
                </a>
              </li>
            ) : null}
            <li className="text-[12.5px]">Mon–Sat, 10 AM – 7 PM IST</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1200px] px-4 py-5 text-[12.5px] text-subtle sm:px-6">© {year} Tabla. All rights reserved.</p>
      </div>
    </footer>
  );
}

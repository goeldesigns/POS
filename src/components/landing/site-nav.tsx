"use client";

import { ArrowRight, LogIn, Menu, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignIn } from "./signin";

const LINKS = [
  { id: "tour", label: "Product tour" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "pricing", label: "Pricing" },
  { id: "demo", label: "Book a demo" },
  { id: "faq", label: "FAQ" },
];

export function SiteNav() {
  const { open } = useSignIn();
  const [scrolled, setScrolled] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled || menu ? "bg-surface/85 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <div className={cn("mx-auto flex max-w-[1200px] items-center gap-6 px-4 transition-[height] duration-300 sm:px-6", scrolled ? "h-16" : "h-20")}>
        <Link href="/" className="shrink-0" aria-label="Tabla home">
          <Logo subtitle={null} />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              className={cn(
                "relative rounded-lg px-3 py-2 text-[14px] font-medium transition-colors",
                active === l.id ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {l.label}
              <span
                className={cn(
                  "absolute inset-x-3 -bottom-0.5 h-0.5 origin-left rounded-full bg-brand-500 transition-transform duration-300",
                  active === l.id ? "scale-x-100" : "scale-x-0",
                )}
                aria-hidden
              />
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <Button variant="ghost" onClick={open}>
            <LogIn /> Log in to POS
          </Button>
          <Button asChild className="lp-sheen">
            <a href="#demo">
              Book a demo <ArrowRight />
            </a>
          </Button>
        </div>

        <button
          suppressHydrationWarning
          type="button"
          className="ml-auto grid size-10 place-items-center rounded-lg text-ink hover:bg-sunken sm:ml-2 lg:hidden"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-label={menu ? "Close menu" : "Open menu"}
        >
          {menu ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <div className={cn("lp-collapse border-t border-line lg:hidden", !menu && "border-transparent")} data-open={menu ? "" : undefined}>
        <div>
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 pt-3 pb-5">
            {LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setMenu(false)} className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-sunken">
                {l.label}
              </a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMenu(false);
                  open();
                }}
              >
                <LogIn /> Log in to POS
              </Button>
              <Button asChild>
                <a href="#demo" onClick={() => setMenu(false)}>
                  Book a demo
                </a>
              </Button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

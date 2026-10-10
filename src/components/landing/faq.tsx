"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What do I need to run Tabla?",
    a: "A laptop, desktop, tablet or phone with a modern browser and an internet connection. Receipts and KOTs print on standard 80 mm or 58 mm thermal printers connected to that device — there's no plugin or desktop app to install.",
  },
  {
    q: "Does it work without internet?",
    a: "Tabla is a cloud POS, so billing needs a connection. Most restaurants keep a mobile hotspot as a backup; we'll go through your setup during the demo.",
  },
  {
    q: "Are the bills GST-ready?",
    a: "Yes. Receipts show your GSTIN and FSSAI number with tax split into CGST and SGST, prices can be tax-inclusive or exclusive, and the Tax report gives a day-by-day breakdown you can export for your accountant.",
  },
  {
    q: "Can my staff only see what they need?",
    a: "Every person gets their own login with a role — Owner, Manager, Cashier, Waiter, Kitchen, Accountant or Inventory Manager — and you can fine-tune individual permissions such as discounts, refunds, voids or report access.",
  },
  {
    q: "We have more than one outlet. Does that work?",
    a: "Each outlet has its own menu, tables, stock and staff. Owners and managers who work across outlets switch between them from the same login.",
  },
  {
    q: "Do you integrate with Swiggy and Zomato?",
    a: "Tabla has a dedicated Swiggy & Zomato module: aggregator orders arrive through a signed webhook into the same kitchen queue and reports as counter orders. Live partner connections depend on Swiggy and Zomato approving API access for your outlet — we'll check availability with you during the demo.",
  },
  {
    q: "How does setup work?",
    a: "After the demo, our team creates your workspace and loads your menu, taxes, tables, printers and staff logins with you. Nothing has to be installed on your devices.",
  },
  {
    q: "Is my data safe, and can I take it with me?",
    a: "Each restaurant's data is isolated, passwords are hashed and sensitive actions are logged. Sales, customers and every report can be exported to CSV whenever you like.",
  },
];

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

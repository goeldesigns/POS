import { Clock, Phone, Video } from "lucide-react";
import type { Metadata } from "next";
import { BackOfficeGrid } from "@/components/landing/bento";
import { FinalCta, SiteFooter } from "@/components/landing/closing";
import { DemoScheduler } from "@/components/landing/demo-scheduler";
import { Faq } from "@/components/landing/faq";
import { FAQS } from "@/components/landing/faq-data";
import { FeatureTabs, type FeatureTab } from "@/components/landing/feature-tabs";
import { Hero } from "@/components/landing/hero";
import "@/components/landing/landing.css";
import { CapabilityMarquee } from "@/components/landing/marquee";
import { Reveal } from "@/components/landing/motion";
import { Pricing, type PublicPlan } from "@/components/landing/pricing";
import { ProductTour } from "@/components/landing/product-tour";
import { TOUR_DURATION } from "@/components/landing/tour-chapters";
import { FactsBand, HowItWorks, SectionHeading, Security } from "@/components/landing/sections";
import { SignInProvider, type DemoAccount } from "@/components/landing/signin";
import { SiteNav } from "@/components/landing/site-nav";
import { BRAND } from "@/config/brand";
import { SITE } from "@/config/site";
import { DEMO } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { CORE_MODULES, MODULE_CATALOG, PLAN_FLAGS, isModuleKey, type ModuleKey, type PlanFlag } from "@/lib/permissions/catalog";
import { demoAvailability } from "@/server/services/demos";
import { getPlatformSettings, listPublicPlans } from "@/server/services/platform";
import inventoryShot from "../../public/landing/inventory.webp";
import kitchenShot from "../../public/landing/kitchen.webp";
import posShot from "../../public/landing/pos.webp";
import recipesShot from "../../public/landing/recipes.webp";
import reportsShot from "../../public/landing/reports.webp";
import tablesShot from "../../public/landing/tables.webp";

// Rendered per request: plans, prices and demo slots come live from the database.
export const dynamic = "force-dynamic";

const PAGE_TITLE = `${BRAND.name} — Restaurant POS for billing, kitchen, stock & reports`;
const PAGE_DESCRIPTION =
  "Tabla is a restaurant point of sale for India: fast billing with UPI and split payments, KOTs by kitchen station, recipe-based inventory, GST-ready reports and role-based staff access.";

export const metadata: Metadata = {
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESCRIPTION,
  keywords: [...SITE.keywords],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: BRAND.name,
    locale: SITE.locale,
    images: [{ url: SITE.ogImage, ...SITE.ogImageSize, alt: "Tabla restaurant POS: menu, running order and totals on one screen" }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION, images: [SITE.ogImage] },
};

function structuredData(plans: PublicPlan[]) {
  const priced = plans.filter((p) => p.priceMonthly > 0);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: BRAND.name,
        url: SITE.url,
        logo: `${SITE.url}/icon.svg`,
        email: BRAND.supportEmail,
        contactPoint: { "@type": "ContactPoint", telephone: BRAND.supportPhone, contactType: "sales", areaServed: "IN", availableLanguage: "English" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        url: SITE.url,
        name: BRAND.name,
        publisher: { "@id": `${SITE.url}/#organization` },
        inLanguage: "en-IN",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.url}/#software`,
        name: `${BRAND.name} restaurant POS`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web browser",
        description: PAGE_DESCRIPTION,
        url: SITE.url,
        publisher: { "@id": `${SITE.url}/#organization` },
        ...(priced.length
          ? {
              offers: priced.map((p) => ({
                "@type": "Offer",
                name: p.name,
                price: (p.priceMonthly / 100).toFixed(2),
                priceCurrency: "INR",
                url: `${SITE.url}/#pricing`,
              })),
            }
          : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

const FEATURES: FeatureTab[] = [
  {
    key: "billing",
    label: "Billing & POS",
    title: "A counter that keeps up with the Friday rush",
    text: "Photo menu, variants and add-ons, tables and customers on one screen. Keyboard shortcuts for the busiest counters.",
    points: [
      "Cash, card, UPI QR or split across several methods",
      "Discounts, coupons and loyalty redemption with permission checks",
      "Dine-in, takeaway, delivery and online from the same screen",
      "Paid orders go straight to the kitchen; tables can pay after the meal",
    ],
    image: posShot,
    alt: "Tabla POS with menu photos, categories and a running order with GST and service charge",
    url: "Tabla · POS",
  },
  {
    key: "kitchen",
    label: "Kitchen & orders",
    title: "One queue from order to pass",
    text: "Tickets move New → Preparing → Ready → Complete with live timers — and the kitchen never sees a price.",
    points: [
      "KOTs routed to Tandoor, Bar, Desserts or any station you add",
      "Live ticket timers that flag late orders",
      "Refunds, cancellations and re-orders with reasons on record",
      "Counter, website and aggregator orders in the same pipeline",
    ],
    image: kitchenShot,
    alt: "Kitchen board with New, Preparing and Ready columns and live ticket timers",
    url: "Tabla · Kitchen board",
  },
  {
    key: "tables",
    label: "Tables & reservations",
    title: "Your floor plan, live",
    text: "See which tables are free, seated, reserved or being cleaned — and what each one has ordered.",
    points: [
      "Sections for main hall, outdoor, private dining and bar",
      "Merge, split and transfer tables mid-service",
      "Reservations calendar with guest notes",
      "Tables free up automatically when the bill is settled",
    ],
    image: tablesShot,
    alt: "Floor plan showing table status, open orders, guests and running totals",
    url: "Tabla · Tables",
  },
  {
    key: "recipes",
    label: "Menu & recipes",
    title: "Know the food cost of every plate",
    text: "Attach a recipe to each dish and Tabla works out its cost, margin and suggested price.",
    points: [
      "Ingredient quantities in grams, kg, ml, litres or pieces",
      "Food cost % against your target, per dish",
      "Variants, add-on groups and combos",
      "Mark items sold out in one tap",
    ],
    image: recipesShot,
    alt: "Recipes list with cost per portion, food cost percentage and suggested price",
    url: "Tabla · Recipes",
  },
  {
    key: "inventory",
    label: "Inventory",
    title: "Stock that follows the menu",
    text: "Every settled bill deducts ingredients from your recipes, so stock levels are right without a closing count.",
    points: [
      "Low-stock and expiry alerts",
      "Purchases, receiving and supplier records",
      "Waste log and stock adjustments with reasons",
      "Full ledger of every movement",
    ],
    image: inventoryShot,
    alt: "Inventory overview with low stock, expiring items and stock value by category",
    url: "Tabla · Inventory",
  },
  {
    key: "reports",
    label: "Reports",
    title: "Close the day with numbers you trust",
    text: "Thirteen ready-made reports, filtered by date, order type, payment method, staff or table.",
    points: [
      "Sales, tax, payments, discounts and products",
      "Staff performance and table turnover",
      "Inventory, expenses and P&L",
      "Export to CSV or print to PDF",
    ],
    image: reportsShot,
    alt: "Sales report with daily totals, net sales and tax collected over the last 30 days",
    url: "Tabla · Reports",
  },
];

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: "Owner · Spice & Stone", email: "owner@spiceandstone.demo", password: "Demo@1234" },
  { label: "Cashier", email: "cashier@spiceandstone.demo", password: "Demo@1234" },
  { label: "Manager · 2 restaurants", email: "manager@spiceandstone.demo", password: "Demo@1234" },
  { label: "Super Admin → console", email: "admin@tabla.dev", password: "Admin@12345" },
];

const limit = (n: number | null, one: string, many: string) => (n ? `Up to ${formatNumber(n)} ${n === 1 ? one : many}` : `Unlimited ${many}`);

function moduleLabels(keys: ModuleKey[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (k === "zomato" && keys.includes("swiggy")) continue;
    out.push(k === "swiggy" ? (keys.includes("zomato") ? "Swiggy & Zomato module" : "Swiggy module") : MODULE_CATALOG[k].label);
  }
  return out;
}

export default async function LandingPage() {
  // Public page: it never looks at who is signed in. Entering a POS always goes through the login form.
  const [settings, plans, days] = await Promise.all([
    getPlatformSettings(),
    listPublicPlans(),
    demoAvailability(),
  ]);

  const visible = plans.filter((p) => p.isActive && p.isPublic);
  const publicPlans: PublicPlan[] = visible.map((p, i) => {
    const modules = p.features.filter(isModuleKey).filter((m) => !CORE_MODULES.includes(m));
    const flags = p.features.filter((f): f is PlanFlag => f in PLAN_FLAGS);
    const prev = visible[i - 1];
    const prevModules = new Set(prev?.features ?? []);
    return {
      key: p.key,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      trialDays: p.trialDays,
      limits: [limit(p.maxUsers, "staff login", "staff logins"), limit(p.maxTables, "table", "tables"), limit(p.maxProducts, "menu item", "menu items")],
      inherits: prev?.name ?? null,
      modules: moduleLabels(prev ? modules.filter((m) => !prevModules.has(m)) : modules),
      extras: flags.filter((f) => !prevModules.has(f)).map((f) => PLAN_FLAGS[f]),
    };
  });
  const signupPlan = plans.find((p) => p.key === settings.defaultPlanKey);
  const showDemoAccounts = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";

  return (
    <div className="lp-root overflow-x-clip bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(publicPlans)).replace(/</g, "\\u003c") }}
      />
      <SignInProvider demoAccounts={showDemoAccounts ? DEMO_ACCOUNTS : undefined} signupEnabled={settings.allowSelfSignup}>
        <SiteNav />
        <main>
          <Hero trialDays={signupPlan?.trialDays || 14} signupEnabled={settings.allowSelfSignup} />
          <CapabilityMarquee />

          <section id="tour" aria-labelledby="tour-title" className="scroll-mt-20 bg-night py-24 sm:py-28">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
              <SectionHeading
                dark
                id="tour-title"
                eyebrow="Product tour"
                title="See a whole shift in Tabla,"
                accent="start to finish."
                text={`${Math.round(TOUR_DURATION / 60)} minutes of the real product: orders, the kitchen board, payments, tables, stock, staff and reports. Pick a chapter to jump straight to it.`}
              />
              <Reveal anim="up" delay={120} className="mt-12">
                <ProductTour />
              </Reveal>
            </div>
          </section>

          <section id="features" className="scroll-mt-20 py-24 sm:py-28">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
              <SectionHeading
                eyebrow="Features"
                title="Built around a real service,"
                accent="not a spreadsheet."
                text="Everything below is a screen from Tabla itself — the same one your team will use on the floor."
              />
              <div className="mt-14">
                <FeatureTabs tabs={FEATURES} />
              </div>
            </div>
          </section>

          <section aria-labelledby="back-office" className="bg-canvas py-24 sm:py-28">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
              <SectionHeading
                eyebrow="Back office"
                title="The rest of the restaurant,"
                accent="handled."
                text="Printing, staff, expenses, loyalty and stock — connected to every bill instead of living in separate apps."
              />
              <div className="mt-14">
                <BackOfficeGrid />
              </div>
            </div>
          </section>

          <FactsBand />
          <HowItWorks />
          <Security />

          <section id="pricing" className="scroll-mt-20 py-24 sm:py-28">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
              <SectionHeading eyebrow="Pricing" title="Simple plans that" accent="grow with you." text="Every plan includes billing, KOTs, tables, menu, customers and reports. Pay monthly or save with yearly billing." />
              <div className="mt-10">
                <Pricing plans={publicPlans} signupPlanKey={settings.defaultPlanKey} signupEnabled={settings.allowSelfSignup} />
              </div>
            </div>
          </section>

          <section id="demo" className="scroll-mt-20 bg-canvas py-24 sm:py-28">
            <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="lg:sticky lg:top-28">
                <SectionHeading align="left" eyebrow="Book a demo" title="See Tabla on a menu" accent="like yours." text={`A ${DEMO.durationMinutes}-minute video call with a product specialist. Pick a time that suits you — we'll call to confirm.`} />
                <ol className="mt-8 space-y-4">
                  {[
                    { time: "5 min", text: "Your outlet today — counters, kitchen stations, how you bill and buy stock" },
                    { time: "15 min", text: "Live walkthrough — billing, KOTs, tables, UPI and split payments" },
                    { time: "10 min", text: "Stock, reports and staff access — and the plan that fits" },
                  ].map((a, i) => (
                    <Reveal as="li" key={a.time} anim="left" delay={i * 120} className="flex gap-4">
                      <span className="mt-0.5 w-14 shrink-0 rounded-md bg-surface py-1 text-center text-[12px] font-semibold text-brand-600 ring-1 ring-line">{a.time}</span>
                      <span className="text-[14.5px] leading-relaxed text-ink-2">{a.text}</span>
                    </Reveal>
                  ))}
                </ol>
                <Reveal anim="up" delay={200} className="mt-8 grid gap-3 text-[13.5px] text-muted sm:grid-cols-2 lg:grid-cols-1">
                  <p className="flex items-center gap-2.5">
                    <Video className="size-4 text-brand-500" /> Over a video call — we&apos;ll send you the link
                  </p>
                  <p className="flex items-center gap-2.5">
                    <Clock className="size-4 text-brand-500" /> Mon–Sat, 10 AM – 7 PM {DEMO.timezoneLabel}
                  </p>
                  {settings.supportPhone ? (
                    <p className="flex items-center gap-2.5">
                      <Phone className="size-4 text-brand-500" /> Prefer to talk now?{" "}
                      <a href={`tel:${settings.supportPhone.replace(/\s/g, "")}`} className="font-semibold text-ink hover:text-brand-600">
                        {settings.supportPhone}
                      </a>
                    </p>
                  ) : null}
                </Reveal>
              </div>
              <Reveal anim="right" delay={120}>
                <DemoScheduler initialDays={days} />
              </Reveal>
            </div>
          </section>

          <section id="faq" className="scroll-mt-20 py-24 sm:py-28">
            <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
              <SectionHeading eyebrow="FAQ" title="Questions owners" accent="usually ask." />
              <div className="mt-12">
                <Faq />
              </div>
            </div>
          </section>

          <FinalCta />
        </main>
        <SiteFooter supportEmail={settings.supportEmail} supportPhone={settings.supportPhone} signupEnabled={settings.allowSelfSignup} />
      </SignInProvider>
    </div>
  );
}

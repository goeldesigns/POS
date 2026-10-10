import {
  Armchair,
  BadgePercent,
  Bike,
  BookOpenCheck,
  CalendarDays,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  Gift,
  Globe,
  HandCoins,
  KeyRound,
  Merge,
  Printer,
  QrCode,
  ReceiptIndianRupee,
  ScrollText,
  ShoppingBag,
  SquareSplitHorizontal,
  Timer,
  Truck,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Chip = [label: string, icon: LucideIcon, tone: string];

const ROW_ONE: Chip[] = [
  ["Dine-in", Utensils, "text-brand-500"],
  ["Takeaway", ShoppingBag, "text-saffron"],
  ["Delivery", Bike, "text-mint"],
  ["Website orders", Globe, "text-ocean"],
  ["UPI QR", QrCode, "text-brand-500"],
  ["Card & cash", CreditCard, "text-saffron"],
  ["Split bills", SquareSplitHorizontal, "text-mint"],
  ["Coupons & discounts", BadgePercent, "text-blush"],
  ["GST invoices", ReceiptIndianRupee, "text-ocean"],
  ["KOT printing", Printer, "text-turmeric"],
  ["Loyalty points", Gift, "text-blush"],
];

const ROW_TWO: Chip[] = [
  ["Merge & transfer tables", Merge, "text-turmeric"],
  ["Reservations", CalendarDays, "text-brand-500"],
  ["Kitchen stations", ChefHat, "text-saffron"],
  ["Live ticket timers", Timer, "text-mint"],
  ["Recipe costing", BookOpenCheck, "text-ocean"],
  ["Purchases & suppliers", Truck, "text-turmeric"],
  ["Stock ledger", ClipboardList, "text-mint"],
  ["Staff attendance", Users, "text-brand-500"],
  ["Expenses & P&L", Wallet, "text-saffron"],
  ["CSV & PDF reports", FileSpreadsheet, "text-ocean"],
  ["Role permissions", KeyRound, "text-blush"],
  ["Audit trail", ScrollText, "text-brand-500"],
  ["Customer profiles", HandCoins, "text-mint"],
];

function Row({ chips, reverse, speed }: { chips: Chip[]; reverse?: boolean; speed: string }) {
  const items = [...chips, ...chips];
  return (
    <div className="lp-marquee-mask overflow-hidden">
      <ul className="lp-marquee flex gap-3 py-1.5" data-reverse={reverse ? "" : undefined} style={{ "--lp-speed": speed } as React.CSSProperties}>
        {items.map(([label, Icon, tone], i) => (
          <li
            key={`${label}-${i}`}
            aria-hidden={i >= chips.length}
            className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13.5px] font-medium whitespace-nowrap text-ink-2 shadow-card"
          >
            <Icon className={cn("size-4", tone)} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CapabilityMarquee() {
  return (
    <section aria-label="Capabilities" className="border-y border-line bg-canvas py-8">
      <p className="mb-5 text-center text-[12.5px] font-semibold tracking-[0.14em] text-subtle uppercase">Everything a service needs, on one system</p>
      <div className="space-y-3">
        <Row chips={ROW_ONE} speed="46s" />
        <Row chips={ROW_TWO} reverse speed="58s" />
      </div>
    </section>
  );
}

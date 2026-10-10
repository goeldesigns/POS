/**
 * Order pricing engine — shared by the POS (live preview) and the server
 * (authoritative totals). All amounts are integer minor units.
 *
 * Order of operations
 *   1. line gross   = (unit price + modifiers) × qty
 *   2. discounts    = applied on the subtotal, allocated pro-rata to lines
 *   3. tax          = per line on the discounted amount (inclusive or exclusive)
 *   4. service chg  = % of the discounted, pre-tax amount
 *   5. round-off    = to the nearest whole currency unit (optional)
 */

export interface PricingLineInput {
  unitPrice: number;
  quantity: number;
  modifiersTotal?: number;
  /** Tax rate in percent, e.g. 5 for GST 5%. */
  taxRate: number;
  taxName?: string;
}

export interface PricingDiscountInput {
  type: "PERCENT" | "FLAT";
  value: number;
  source?: "MANUAL" | "COUPON" | "LOYALTY";
  /** Optional cap (minor units) — used by coupons with a maximum discount. */
  maxAmount?: number;
}

export interface PricingConfig {
  taxInclusive: boolean;
  serviceChargePercent: number;
  roundOff: boolean;
}

export interface PricedLine {
  gross: number;
  discount: number;
  net: number;
  taxable: number;
  tax: number;
  taxRate: number;
  total: number;
}

export interface TaxBreakdownRow {
  name: string;
  rate: number;
  taxable: number;
  amount: number;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotal: number;
  discounts: (PricingDiscountInput & { amount: number })[];
  discountTotal: number;
  taxTotal: number;
  taxBreakdown: TaxBreakdownRow[];
  serviceCharge: number;
  roundOff: number;
  total: number;
}

const round = (n: number) => Math.round(n);

export function calculateTotals(
  lines: readonly PricingLineInput[],
  discounts: readonly PricingDiscountInput[],
  config: PricingConfig,
): PricingResult {
  const gross = lines.map((l) => round((l.unitPrice + (l.modifiersTotal ?? 0)) * l.quantity));
  const subtotal = gross.reduce((a, b) => a + b, 0);

  // Discounts apply sequentially on what remains so they never exceed the bill.
  let remaining = subtotal;
  const appliedDiscounts = discounts.map((d) => {
    let amount = d.type === "PERCENT" ? round((remaining * Math.min(Math.max(d.value, 0), 100)) / 100) : round(d.value);
    if (d.maxAmount != null) amount = Math.min(amount, d.maxAmount);
    amount = Math.max(0, Math.min(amount, remaining));
    remaining -= amount;
    return { ...d, amount };
  });
  const discountTotal = subtotal - remaining;

  // Allocate discount across lines proportionally; last line absorbs rounding.
  const lineDiscounts: number[] = [];
  let allocated = 0;
  gross.forEach((g, i) => {
    if (i === gross.length - 1) {
      lineDiscounts.push(discountTotal - allocated);
    } else {
      const share = subtotal === 0 ? 0 : round((discountTotal * g) / subtotal);
      lineDiscounts.push(share);
      allocated += share;
    }
  });

  const priced: PricedLine[] = lines.map((l, i) => {
    const net = gross[i]! - (lineDiscounts[i] ?? 0);
    const rate = Math.max(0, l.taxRate);
    let tax: number;
    let taxable: number;
    if (config.taxInclusive) {
      taxable = round(net / (1 + rate / 100));
      tax = net - taxable;
    } else {
      taxable = net;
      tax = round((net * rate) / 100);
    }
    return {
      gross: gross[i]!,
      discount: lineDiscounts[i] ?? 0,
      net,
      taxable,
      tax,
      taxRate: rate,
      total: config.taxInclusive ? net : net + tax,
    };
  });

  const taxTotal = priced.reduce((a, l) => a + l.tax, 0);
  const taxableTotal = priced.reduce((a, l) => a + l.taxable, 0);

  const breakdownMap = new Map<string, TaxBreakdownRow>();
  priced.forEach((p, i) => {
    if (p.taxRate <= 0) return;
    const name = lines[i]!.taxName ?? `GST ${p.taxRate}%`;
    const key = `${name}|${p.taxRate}`;
    const row = breakdownMap.get(key) ?? { name, rate: p.taxRate, taxable: 0, amount: 0 };
    row.taxable += p.taxable;
    row.amount += p.tax;
    breakdownMap.set(key, row);
  });

  const serviceCharge = round((taxableTotal * Math.max(0, config.serviceChargePercent)) / 100);
  const beforeRound = (config.taxInclusive ? remaining : remaining + taxTotal) + serviceCharge;
  const total = config.roundOff ? round(beforeRound / 100) * 100 : beforeRound;

  return {
    lines: priced,
    subtotal,
    discounts: appliedDiscounts,
    discountTotal,
    taxTotal,
    taxBreakdown: [...breakdownMap.values()],
    serviceCharge,
    roundOff: total - beforeRound,
    total,
  };
}

/** Points earned for a paid amount, e.g. 10 points per ₹100. */
export function loyaltyPointsFor(paidMinor: number, pointsPerHundred: number): number {
  if (paidMinor <= 0 || pointsPerHundred <= 0) return 0;
  return Math.floor((paidMinor / 100 / 100) * pointsPerHundred);
}

/** Largest number of points redeemable on a bill under programme limits. */
export function maxRedeemablePoints(opts: {
  balance: number;
  billMinor: number;
  pointValue: number;
  maxRedeemPercent: number;
  minRedeemPoints: number;
}): number {
  const { balance, billMinor, pointValue, maxRedeemPercent, minRedeemPoints } = opts;
  if (balance < minRedeemPoints || pointValue <= 0) return 0;
  const capMinor = Math.floor((billMinor * maxRedeemPercent) / 100);
  const byCap = Math.floor(capMinor / pointValue);
  return Math.max(0, Math.min(balance, byCap));
}

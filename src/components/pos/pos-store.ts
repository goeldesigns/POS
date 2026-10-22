import type { PosBootstrap, PosOrder } from "@/server/services/pos";
import { calculateTotals, type PricingDiscountInput } from "@/lib/pricing";

export type Product = PosBootstrap["products"][number];
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "ONLINE";
export type OnlineSource = "SWIGGY" | "ZOMATO" | "WEBSITE" | "OTHER";

export interface CartLine {
  key: string;
  productId: string;
  variantId: string | null;
  modifierIds: string[];
  quantity: number;
  notes: string | null;
  name: string;
  variantName: string | null;
  modifierNames: string[];
  unitPrice: number;
  modifiersTotal: number;
  taxRate: number;
  imageUrl: string | null;
  foodType: string;
}

export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  loyaltyBalance: number;
}

export interface CouponDef {
  code: string;
  description: string | null;
  type: "PERCENT" | "FLAT";
  value: number;
  maxAmount: number | null;
}

export interface PosState {
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  paidTotal: number;
  type: OrderType;
  tableId: string | null;
  guests: number | null;
  customer: PosCustomer | null;
  lines: CartLine[];
  selectedKey: string | null;
  notes: string;
  discount: { type: "PERCENT" | "FLAT"; value: number; reason: string | null } | null;
  coupon: CouponDef | null;
  redeemPoints: number;
  deliveryAddress: string;
  onlineSource: OnlineSource;
  externalRef: string;
}

export type PosAction =
  | { type: "add"; line: Omit<CartLine, "key"> }
  | { type: "qty"; key: string; delta: number }
  | { type: "setQty"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "select"; key: string | null }
  | { type: "set"; patch: Partial<PosState> }
  | { type: "reset"; state: PosState };

let seq = 0;
const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

const sameLine = (a: Omit<CartLine, "key">, b: CartLine) =>
  a.productId === b.productId &&
  a.variantId === b.variantId &&
  a.modifierIds.slice().sort().join() === b.modifierIds.slice().sort().join() &&
  (a.notes ?? "") === (b.notes ?? "");

export function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "add": {
      const existing = state.lines.find((l) => sameLine(action.line, l));
      if (existing) {
        return {
          ...state,
          selectedKey: existing.key,
          lines: state.lines.map((l) => (l.key === existing.key ? { ...l, quantity: Math.min(500, l.quantity + action.line.quantity) } : l)),
        };
      }
      const key = newKey();
      return { ...state, selectedKey: key, lines: [...state.lines, { ...action.line, key }] };
    }
    case "qty": {
      const lines = state.lines
        .map((l) => (l.key === action.key ? { ...l, quantity: Math.min(500, l.quantity + action.delta) } : l))
        .filter((l) => l.quantity > 0);
      return { ...state, lines, selectedKey: lines.some((l) => l.key === state.selectedKey) ? state.selectedKey : (lines[lines.length - 1]?.key ?? null) };
    }
    case "setQty":
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, quantity: Math.max(1, Math.min(500, action.quantity)) } : l)) };
    case "remove": {
      const lines = state.lines.filter((l) => l.key !== action.key);
      return { ...state, lines, selectedKey: lines[lines.length - 1]?.key ?? null };
    }
    case "select":
      return { ...state, selectedKey: action.key };
    case "set":
      return { ...state, ...action.patch };
    case "reset":
      return action.state;
  }
}

export function emptyState(defaultType: OrderType): PosState {
  return {
    orderId: null,
    orderNumber: null,
    orderStatus: null,
    paidTotal: 0,
    type: defaultType,
    tableId: null,
    guests: null,
    customer: null,
    lines: [],
    selectedKey: null,
    notes: "",
    discount: null,
    coupon: null,
    redeemPoints: 0,
    deliveryAddress: "",
    onlineSource: "SWIGGY",
    externalRef: "",
  };
}

/** Rebuild cart lines for an existing order using current menu data. */
export function stateFromOrder(order: PosOrder, products: Product[], coupon: CouponDef | null): PosState {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: CartLine[] = [];
  for (const l of order.lines) {
    const p = l.productId ? byId.get(l.productId) : undefined;
    if (!p) continue;
    const variant = p.variants.find((v) => v.id === l.variantId) ?? null;
    const mods = p.modifierGroups.flatMap((g) => g.modifiers).filter((m) => l.modifierIds.includes(m.id));
    lines.push({
      key: newKey(),
      productId: p.id,
      variantId: variant?.id ?? null,
      modifierIds: mods.map((m) => m.id),
      quantity: l.quantity,
      notes: l.notes,
      name: p.name,
      variantName: variant?.name ?? null,
      modifierNames: mods.map((m) => m.name),
      unitPrice: variant?.price ?? p.price,
      modifiersTotal: mods.reduce((s, m) => s + m.price, 0),
      taxRate: p.taxRate,
      imageUrl: p.imageUrl,
      foodType: p.foodType,
    });
  }
  const source = order.source as string;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paidTotal: order.paidTotal,
    type: order.type as OrderType,
    tableId: order.tableId,
    guests: order.guests,
    customer: order.customer,
    lines,
    selectedKey: lines[lines.length - 1]?.key ?? null,
    notes: order.notes ?? "",
    discount: order.discount ? { type: order.discount.type, value: order.discount.value, reason: order.discount.reason } : null,
    coupon,
    redeemPoints: order.redeemPoints,
    deliveryAddress: order.deliveryAddress ?? "",
    onlineSource: (["SWIGGY", "ZOMATO", "WEBSITE"].includes(source) ? source : "OTHER") as OnlineSource,
    externalRef: order.externalRef ?? "",
  };
}

export function computeTotals(
  state: PosState,
  settings: { taxInclusive: boolean; serviceChargePercent: number; roundOffTotals: boolean },
  pointValue: number,
) {
  const discounts: PricingDiscountInput[] = [];
  if (state.discount && state.discount.value > 0) discounts.push({ type: state.discount.type, value: state.discount.value, source: "MANUAL" });
  if (state.coupon) {
    discounts.push({ type: state.coupon.type, value: state.coupon.value, maxAmount: state.coupon.maxAmount ?? undefined, source: "COUPON" });
  }
  if (state.redeemPoints > 0) discounts.push({ type: "FLAT", value: state.redeemPoints * pointValue, source: "LOYALTY" });
  return calculateTotals(
    state.lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, modifiersTotal: l.modifiersTotal, taxRate: l.taxRate })),
    discounts,
    {
      taxInclusive: settings.taxInclusive,
      serviceChargePercent: state.type === "DINE_IN" ? settings.serviceChargePercent : 0,
      roundOff: settings.roundOffTotals,
    },
  );
}

/** Payload for saveOrder / checkout server actions. */
export function draftPayload(state: PosState) {
  return {
    orderId: state.orderId,
    source: state.type === "ONLINE" ? state.onlineSource : ("POS" as const),
    type: state.type,
    tableId: state.type === "DINE_IN" ? state.tableId : null,
    customerId: state.customer?.id ?? null,
    guests: state.type === "DINE_IN" ? state.guests : null,
    notes: state.notes || null,
    deliveryAddress: state.type === "DELIVERY" ? state.deliveryAddress || null : null,
    items: state.lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      quantity: l.quantity,
      modifierIds: l.modifierIds,
      notes: l.notes,
    })),
    discount: state.discount,
    couponCode: state.coupon?.code ?? null,
    redeemPoints: state.redeemPoints || null,
    externalRef: state.type === "ONLINE" ? state.externalRef || null : null,
  };
}

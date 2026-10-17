import type { FoodType, OrderStatus, OrderType, TableStatus } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

export interface PosBootstrap {
  categories: { id: string; name: string; color: string | null }[];
  products: {
    id: string;
    name: string;
    sku: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    foodType: FoodType;
    categoryId: string;
    isAvailable: boolean;
    isBestseller: boolean;
    isFeatured: boolean;
    isSpicy: boolean;
    isCombo: boolean;
    preparationTime: number | null;
    barcode: string | null;
    taxRate: number;
    variants: { id: string; name: string; price: number; isDefault: boolean }[];
    modifierGroups: { id: string; name: string; minSelect: number; maxSelect: number; modifiers: { id: string; name: string; price: number }[] }[];
    comboSummary: string | null;
  }[];
  floors: {
    id: string;
    name: string;
    tables: {
      id: string;
      name: string;
      capacity: number;
      status: TableStatus;
      occupiedSince: string | null;
      mergedIntoId: string | null;
      openOrder: { id: string; orderNumber: string; total: number; status: OrderStatus } | null;
    }[];
  }[];
  settings: {
    taxInclusive: boolean;
    serviceChargePercent: number;
    roundOffTotals: boolean;
    defaultOrderType: OrderType;
    requireCustomerForDelivery: boolean;
    acceptCash: boolean;
    acceptCard: boolean;
    acceptUpi: boolean;
    upiId: string | null;
    autoPrintKot: boolean;
    autoPrintReceipt: boolean;
    taxName: string;
  };
  loyalty: { isEnabled: boolean; pointValue: number; minRedeemPoints: number; maxRedeemPercent: number; pointsPerHundred: number };
  openOrders: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    type: OrderType;
    total: number;
    paidTotal: number;
    createdAt: string;
    customerName: string | null;
    tableName: string | null;
    items: number;
  }[];
}

export async function getPosBootstrap(_ctx: ServiceContext) {
  return backend.get<PosBootstrap>("/api/v1/pos/bootstrap");
}

export interface PosOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  open: boolean;
  type: OrderType;
  source: string;
  tableId: string | null;
  guests: number | null;
  notes: string | null;
  deliveryAddress: string | null;
  externalRef: string | null;
  total: number;
  paidTotal: number;
  customer: { id: string; name: string; phone: string; loyaltyBalance: number } | null;
  discount: { type: "PERCENT" | "FLAT"; value: number; reason: string | null } | null;
  couponCode: string | null;
  redeemPoints: number;
  lines: { productId: string; variantId: string | null; quantity: number; notes: string | null; modifierIds: string[] }[];
}

export async function getOrderForPos(_ctx: ServiceContext, orderId: string) {
  return backend.get<PosOrder>(`/api/v1/pos/orders/${orderId}`);
}

export async function getCouponByCode(_ctx: ServiceContext, code: string) {
  return backend
    .get<{ code: string; description: string | null; type: "PERCENT" | "FLAT"; value: number; maxAmount: number | null }>(`/api/v1/pos/coupons/${encodeURIComponent(code)}`)
    .catch(() => null);
}

export async function getCustomerForPos(_ctx: ServiceContext, id: string) {
  return backend.get<{ id: string; name: string; phone: string; loyaltyBalance: number }>(`/api/v1/pos/customers/${id}`).catch(() => null);
}

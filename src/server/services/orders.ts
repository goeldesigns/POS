import type { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

export const OPEN_ORDER_STATUSES = ["DRAFT", "NEW", "PREPARING", "READY", "SERVED"] as const;

export interface OrderLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  modifierIds?: string[];
  notes?: string | null;
}

export interface OrderDraftInput {
  source?: OrderSource;
  type: OrderType;
  tableId?: string | null;
  customerId?: string | null;
  customer?: { name: string; phone: string | null; email?: string | null } | null;
  guests?: number | null;
  notes?: string | null;
  deliveryAddress?: string | null;
  items: OrderLineInput[];
  discount?: { type: "PERCENT" | "FLAT"; value: number; reason?: string | null } | null;
  couponCode?: string | null;
  redeemPoints?: number | null;
  externalRef?: string | null;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number | null;
  reference?: string | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  total: number;
  paidTotal: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

export async function saveOrder(_ctx: ServiceContext, input: OrderDraftInput & { orderId?: string | null }, mode: "DRAFT" | "KITCHEN") {
  return backend.post<OrderSummary>("/api/v1/pos/orders", { order: input, mode });
}

export async function checkout(_ctx: ServiceContext, input: OrderDraftInput & { orderId?: string | null; payments: PaymentInput[] }) {
  const { payments, ...order } = input;
  return backend.post<OrderSummary>("/api/v1/pos/checkout", { order, payments });
}

export async function recordPayments(_ctx: ServiceContext, orderId: string, payments: PaymentInput[]) {
  return backend.post<OrderSummary>(`/api/v1/orders/${orderId}/payments`, { payments });
}

export async function updateOrderStatus(_ctx: ServiceContext, orderId: string, status: "NEW" | "PREPARING" | "READY" | "SERVED" | "COMPLETED") {
  return backend.post<OrderSummary>(`/api/v1/orders/${orderId}/status`, { status });
}

export async function cancelOrder(_ctx: ServiceContext, orderId: string, reason: string) {
  return backend.post<OrderSummary>(`/api/v1/orders/${orderId}/cancel`, { reason });
}

export async function refundOrder(_ctx: ServiceContext, input: { orderId: string; amount: number; method: PaymentMethod; reason: string }) {
  const { orderId, ...body } = input;
  return backend.post<OrderSummary>(`/api/v1/orders/${orderId}/refund`, body);
}

export async function duplicateOrder(ctx: ServiceContext, orderId: string) {
  const { id } = await backend.post<{ id: string }>(`/api/v1/orders/${orderId}/duplicate`);
  const { orderNumber } = await getOrderDetail(ctx, id);
  return { id, orderNumber };
}

export async function transferOrderTable(_ctx: ServiceContext, orderId: string, tableId: string) {
  await backend.put(`/api/v1/orders/${orderId}/table`, { tableId });
}

export interface OrderDetail {
  id: string;
  number: number;
  orderNumber: string;
  source: OrderSource;
  type: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  tableId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  guests: number | null;
  notes: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceCharge: number;
  roundOff: number;
  total: number;
  paidTotal: number;
  refundedTotal: number;
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  externalRef: string | null;
  placedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  table: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  items: {
    id: string;
    productId: string | null;
    variantId: string | null;
    name: string;
    variantName: string | null;
    categoryName: string | null;
    kitchenStation: string | null;
    unitPrice: number;
    quantity: number;
    modifiers: { id: string; name: string; price: number }[];
    modifiersTotal: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    notes: string | null;
    createdAt: string;
  }[];
  payments: {
    id: string;
    kind: "PAYMENT" | "REFUND";
    method: PaymentMethod;
    amount: number;
    receivedAmount: number | null;
    changeAmount: number | null;
    reference: string | null;
    notes: string | null;
    createdAt: string;
  }[];
  discounts: { id: string; source: string; type: string; value: number; amount: number; reason: string | null; couponCode: string | null }[];
  taxes: { id: string; name: string; rate: number; taxableAmount: number; amount: number }[];
  events: { id: string; type: string; message: string; actorName: string | null; createdAt: string }[];
}

export async function getOrderDetail(_ctx: ServiceContext, orderId: string) {
  return backend.get<OrderDetail>(`/api/v1/orders/${orderId}`);
}

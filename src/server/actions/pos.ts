"use server";

import { z } from "zod";
import { checkoutSchema, orderDraftSchema, recordPaymentSchema, sendReceiptSchema } from "@/lib/validation/operations";
import { customerSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { backend } from "../backend/client";
import { checkout, recordPayments, saveOrder } from "../services/orders";
import { getOrderForPos } from "../services/pos";

function summary(order: { id: string; orderNumber: string; total: number; paidTotal: number; status: string; paymentStatus: string }) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
    paidTotal: order.paidTotal,
    status: order.status,
    paymentStatus: order.paymentStatus,
  };
}

export const saveOrderAction = restaurantAction(
  {
    permission: ["pos.create_order", "pos.edit_order", "orders.create"],
    schema: orderDraftSchema.extend({ mode: z.enum(["DRAFT", "KITCHEN"]) }),
    revalidate: false,
  },
  async ({ mode, ...input }, ctx) => summary(await saveOrder(ctx, input, mode)),
);

export const checkoutAction = restaurantAction(
  { permission: "pos.process_payment", schema: checkoutSchema, revalidate: false },
  async (input, ctx) => {
    const order = await checkout(ctx, input);
    const change = input.payments.reduce((s, p) => s + (p.method === "CASH" && p.receivedAmount ? p.receivedAmount - p.amount : 0), 0);
    return { ...summary(order), change: Math.max(0, change) };
  },
);

export const recordPaymentAction = restaurantAction(
  { permission: "pos.process_payment", schema: recordPaymentSchema },
  async (input, ctx) => summary(await recordPayments(ctx, input.orderId, input.payments)),
);

/** POS variant: the screen refreshes itself when the cashier starts the next order. */
export const posRecordPaymentAction = restaurantAction(
  { permission: "pos.process_payment", schema: recordPaymentSchema, revalidate: false },
  async (input, ctx) => summary(await recordPayments(ctx, input.orderId, input.payments)),
);

export const loadOrderForPosAction = restaurantAction(
  { permission: "pos.view", schema: z.object({ orderId: z.string().min(1) }), revalidate: false },
  async (input, ctx) => getOrderForPos(ctx, input.orderId),
);

export const previewCouponAction = restaurantAction(
  { permission: "pos.view", schema: z.object({ code: z.string().trim().min(2).max(30), subtotal: z.number().int().min(0) }), revalidate: false },
  async (input) =>
    backend.post<{ code: string; description: string | null; type: "PERCENT" | "FLAT"; value: number; maxAmount: number | null }>("/api/v1/pos/coupons/preview", input),
);

export const quickCreateCustomerAction = restaurantAction(
  { permission: ["customers.create", "pos.create_order"], schema: customerSchema.pick({ name: true, phone: true, email: true }) },
  async (input) => backend.post<{ id: string; name: string; phone: string | null; loyaltyBalance: number; existed: boolean }>("/api/v1/pos/customers", input),
);

export const sendReceiptAction = restaurantAction(
  { permission: ["pos.view", "orders.view"], schema: sendReceiptSchema, revalidate: false },
  async (input) => {
    await backend.post(`/api/v1/orders/${input.orderId}/receipt`, { email: input.email });
    return { sent: true };
  },
);

"use server";

import { z } from "zod";
import { formatMoney } from "@/lib/format";
import { checkoutSchema, orderDraftSchema, recordPaymentSchema, sendReceiptSchema } from "@/lib/validation/operations";
import { customerSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { audit } from "../audit";
import { BusinessRuleError, NotFoundError } from "../errors";
import { mailer } from "../mailer";
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
  async (input, ctx) => {
    const code = input.code.toUpperCase();
    const coupon = await ctx.db.coupon.findFirst({ where: { code, isActive: true } });
    const now = new Date();
    if (!coupon) throw new BusinessRuleError(`Coupon ${code} is not valid`);
    if (coupon.validFrom && coupon.validFrom > now) throw new BusinessRuleError(`Coupon ${code} isn't active yet`);
    if (coupon.validTo && coupon.validTo < now) throw new BusinessRuleError(`Coupon ${code} has expired`);
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw new BusinessRuleError(`Coupon ${code} has reached its usage limit`);
    if (coupon.minOrder != null && input.subtotal < coupon.minOrder) {
      throw new BusinessRuleError(`${code} needs a minimum order of ${formatMoney(coupon.minOrder)}`);
    }
    return {
      code: coupon.code,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
      maxAmount: coupon.maxDiscount,
    };
  },
);

export const quickCreateCustomerAction = restaurantAction(
  { permission: ["customers.create", "pos.create_order"], schema: customerSchema.pick({ name: true, phone: true, email: true }) },
  async (input, ctx) => {
    const phone = input.phone.replace(/[^\d+]/g, "");
    const existing = await ctx.db.customer.findFirst({ where: { phone }, include: { loyalty: { select: { balance: true } } } });
    if (existing) {
      return { id: existing.id, name: existing.name, phone: existing.phone, loyaltyBalance: existing.loyalty?.balance ?? 0, existed: true };
    }
    const customer = await ctx.db.customer.create({
      data: { restaurantId: ctx.restaurantId, name: input.name, phone, email: input.email },
    });
    await audit(ctx, { action: "customer.created", entity: "Customer", entityId: customer.id, summary: `${ctx.actor.name} added customer ${customer.name} from POS` });
    return { id: customer.id, name: customer.name, phone: customer.phone, loyaltyBalance: 0, existed: false };
  },
);

export const sendReceiptAction = restaurantAction(
  { permission: ["pos.view", "orders.view"], schema: sendReceiptSchema, revalidate: false },
  async (input, ctx) => {
    const order = await ctx.db.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
    if (!order) throw new NotFoundError("Order");
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const lines = order.items.map((i) => `${i.quantity} × ${i.name}${i.variantName ? ` (${i.variantName})` : ""}  ${formatMoney(i.lineTotal)}`);
    await mailer.send({
      to: input.email,
      subject: `Your receipt from ${ctx.restaurant.name} · ${order.orderNumber}`,
      text: [`Thank you for visiting ${ctx.restaurant.name}!`, "", ...lines, "", `Total: ${formatMoney(order.total)}`, "", `View receipt: ${base}/print/receipt/${order.id}`].join("\n"),
    });
    await ctx.db.orderEvent.create({
      data: { restaurantId: ctx.restaurantId, orderId: order.id, type: "receipt", message: `Receipt emailed to ${input.email}`, actorName: ctx.actor.name },
    });
    return { sent: true };
  },
);

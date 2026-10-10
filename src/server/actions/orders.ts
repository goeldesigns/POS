"use server";

import { cancelOrderSchema, orderIdSchema, orderStatusSchema, refundOrderSchema } from "@/lib/validation/operations";
import { restaurantAction } from "../action";
import { cancelOrder, duplicateOrder, refundOrder, updateOrderStatus } from "../services/orders";

export const updateOrderStatusAction = restaurantAction(
  { permission: ["orders.edit", "pos.edit_order"], schema: orderStatusSchema },
  async (input, ctx) => {
    const o = await updateOrderStatus(ctx, input.orderId, input.status);
    return { id: o.id, orderNumber: o.orderNumber, status: o.status };
  },
);

export const cancelOrderAction = restaurantAction(
  { permission: ["orders.cancel", "pos.void_order"], schema: cancelOrderSchema },
  async (input, ctx) => {
    const o = await cancelOrder(ctx, input.orderId, input.reason);
    return { id: o.id, orderNumber: o.orderNumber };
  },
);

export const refundOrderAction = restaurantAction(
  { permission: ["orders.refund", "pos.refund"], schema: refundOrderSchema },
  async (input, ctx) => {
    const o = await refundOrder(ctx, input);
    return { id: o.id, orderNumber: o.orderNumber, paymentStatus: o.paymentStatus };
  },
);

export const duplicateOrderAction = restaurantAction(
  { permission: ["orders.create", "pos.create_order"], schema: orderIdSchema },
  async (input, ctx) => {
    const o = await duplicateOrder(ctx, input.orderId);
    return { id: o.id, orderNumber: o.orderNumber };
  },
);

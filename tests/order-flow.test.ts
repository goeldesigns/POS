import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemContext } from "@/server/auth/load-context";
import { prisma } from "@/server/db";
import { BusinessRuleError, ForbiddenError } from "@/server/errors";
import { cancelOrder, checkout, recordPayments, refundOrder, saveOrder, updateOrderStatus } from "@/server/services/orders";
import { tenantDb } from "@/server/tenant-db";
import { addMember, cleanup, ensureTestPlans, makeRecipeProduct, makeRestaurant, signIn } from "./helpers";

/**
 * One order pipeline for every channel: pricing → payment → completion side
 * effects (recipe stock deduction, loyalty, customer stats, table release).
 */
describe("order → payment → stock → loyalty", () => {
  let restaurantId: string;
  let cashier: Awaited<ReturnType<typeof signIn>>["ctx"];
  let kitchen: Awaited<ReturnType<typeof signIn>>["ctx"];
  let productId: string;
  let ingredientId: string;
  let customerId: string;
  let firstOrderId: string;
  let redeemOrderId: string;

  const stockOf = async () => (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock;
  const loyaltyOf = async () => prisma.loyaltyAccount.findUnique({ where: { customerId } });

  beforeAll(async () => {
    await ensureTestPlans();
    const r = await makeRestaurant("Delta Diner");
    restaurantId = r.restaurant.id;
    // These tests cover a counter without a kitchen screen: paid POS orders close at once.
    // The kitchen-board flow is covered in kitchen-flow.test.ts.
    await prisma.restaurantSettings.update({ where: { restaurantId }, data: { autoCompleteOnPayment: true } });

    // 2 kg of paneer; each portion uses 150 g. ₹200 + 5% GST = ₹210 a plate.
    const made = await makeRecipeProduct(systemContext(restaurantId), { stock: 2, perPortionGrams: 150, price: 20_000 });
    productId = made.product.id;
    ingredientId = made.ingredient.id;

    const customer = await tenantDb(restaurantId).customer.create({ data: { restaurantId, name: "Farah Khan", phone: "9811111111" } });
    customerId = customer.id;

    cashier = (await signIn((await addMember(restaurantId, "Cashier", "cashier")).user.id, restaurantId)).ctx;
    kitchen = (await signIn((await addMember(restaurantId, "Kitchen Staff", "chef")).user.id, restaurantId)).ctx;
  });

  afterAll(cleanup);

  it("a paid POS order completes immediately and deducts recipe stock", async () => {
    const order = await checkout(cashier, {
      type: "TAKEAWAY",
      customerId,
      items: [{ productId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 42_000, receivedAmount: 50_000 }],
    });
    firstOrderId = order.id;

    expect(order.status).toBe("COMPLETED");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.subtotal).toBe(40_000);
    expect(order.taxTotal).toBe(2_000);
    expect(order.total).toBe(42_000);
    expect(order.inventoryDeducted).toBe(true);

    const payment = await prisma.orderPayment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment).toMatchObject({ method: "CASH", amount: 42_000, receivedAmount: 50_000, changeAmount: 8_000 });

    // 2 portions × 150 g = 0.3 kg
    expect(await stockOf()).toBeCloseTo(1.7, 5);
    const sale = await prisma.stockTransaction.findFirstOrThrow({ where: { orderId: order.id } });
    expect(sale.type).toBe("SALE");
    expect(sale.quantity).toBeCloseTo(-0.3, 5);
  });

  it("awards the welcome bonus plus points on the paid amount and updates the customer", async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: firstOrderId } });
    // 10 points per ₹100 → ₹420 earns 42; new members also get the 50-point welcome bonus.
    expect(order.loyaltyPointsEarned).toBe(42);
    const account = await loyaltyOf();
    expect(account).toMatchObject({ balance: 92, lifetimeEarned: 92 });

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(customer.totalOrders).toBe(1);
    expect(customer.totalSpend).toBe(42_000);
    expect(customer.lastVisitAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({ where: { restaurantId, entityId: order.id }, select: { action: true } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["order.created", "payment.received"]));
  });

  it("a dine-in order paid in parts only completes (and frees the table) once fully paid", async () => {
    const table = await tenantDb(restaurantId).diningTable.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });
    const stockBefore = await stockOf();

    const order = await saveOrder(cashier, { type: "DINE_IN", tableId: table.id, customerId, items: [{ productId, quantity: 1 }] }, "KITCHEN");
    expect(order.status).toBe("NEW");
    expect((await prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");

    const partial = await recordPayments(cashier, order.id, [{ method: "UPI", amount: 10_000, reference: "UPI-123" }]);
    expect(partial.paymentStatus).toBe("PARTIALLY_PAID");
    expect(partial.status).toBe("NEW");
    expect(await stockOf()).toBeCloseTo(stockBefore, 5);

    await expect(recordPayments(cashier, order.id, [{ method: "CARD", amount: order.total }])).rejects.toBeInstanceOf(BusinessRuleError);

    const done = await recordPayments(cashier, order.id, [{ method: "CARD", amount: order.total - 10_000 }]);
    expect(done.status).toBe("COMPLETED");
    expect(await stockOf()).toBeCloseTo(stockBefore - 0.15, 5);
    expect((await prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("AVAILABLE");
  });

  it("redeems points as a discount and keeps the ledger balanced", async () => {
    const before = (await loyaltyOf())!;
    expect(before.balance).toBeGreaterThanOrEqual(100);

    const order = await saveOrder(cashier, { type: "TAKEAWAY", customerId, items: [{ productId, quantity: 1 }], redeemPoints: 100 }, "KITCHEN");
    redeemOrderId = order.id;
    expect(order.loyaltyPointsRedeemed).toBe(100);
    expect(order.discountTotal).toBe(2_500); // 100 points × ₹0.25
    const paid = await recordPayments(cashier, order.id, [{ method: "CASH", amount: order.total }]);
    expect(paid.status).toBe("COMPLETED");

    const after = (await loyaltyOf())!;
    expect(after.balance).toBe(before.balance - 100 + paid.loyaltyPointsEarned);
    expect(after.lifetimeRedeemed).toBe(before.lifetimeRedeemed + 100);
    expect(after.balance).toBe(after.lifetimeEarned - after.lifetimeRedeemed - after.lifetimeExpired);

    const ledger = await prisma.loyaltyTransaction.aggregate({ where: { customerId }, _sum: { points: true } });
    expect(ledger._sum.points).toBe(after.balance);
  });

  it("refuses to redeem more points than the programme allows", async () => {
    await expect(
      saveOrder(cashier, { type: "TAKEAWAY", customerId, items: [{ productId, quantity: 1 }], redeemPoints: 5_000 }, "KITCHEN"),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("prepaid channel orders wait for the kitchen before stock moves", async () => {
    const stockBefore = await stockOf();
    const order = await checkout(systemContext(restaurantId), {
      source: "SWIGGY",
      type: "DELIVERY",
      customer: { name: "Swiggy Customer", phone: "9822222222" },
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "OTHER", amount: 21_000, reference: "SWG-1" }],
    });
    expect(order.paymentStatus).toBe("PAID");
    expect(order.status).toBe("NEW");
    expect(await stockOf()).toBeCloseTo(stockBefore, 5);

    await expect(cancelOrder(systemContext(restaurantId), order.id, "Customer changed mind")).rejects.toBeInstanceOf(BusinessRuleError);

    await updateOrderStatus(systemContext(restaurantId), order.id, "PREPARING");
    await updateOrderStatus(systemContext(restaurantId), order.id, "READY");
    await updateOrderStatus(systemContext(restaurantId), order.id, "COMPLETED");
    expect(await stockOf()).toBeCloseTo(stockBefore - 0.15, 5);
  });

  it("kitchen staff can't take payments", async () => {
    const order = await saveOrder(cashier, { type: "TAKEAWAY", items: [{ productId, quantity: 1 }] }, "KITCHEN");
    await expect(recordPayments(kitchen, order.id, [{ method: "CASH", amount: order.total }])).rejects.toBeInstanceOf(ForbiddenError);
    const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.paidTotal).toBe(0);
  });

  it("a full refund reverses the loyalty earned (never below zero) and the customer's spend", async () => {
    const before = (await loyaltyOf())!;
    const customerBefore = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    const refunded = await refundOrder(systemContext(restaurantId), { orderId: firstOrderId, amount: 42_000, method: "CASH", reason: "Wrong order" });
    expect(refunded.status).toBe("REFUNDED");
    expect(refunded.paymentStatus).toBe("REFUNDED");

    // Earned points are taken back, but never below zero — some may already have been spent.
    const after = (await loyaltyOf())!;
    expect(after.balance).toBe(Math.max(0, before.balance - 42));
    const ledger = await prisma.loyaltyTransaction.aggregate({ where: { customerId }, _sum: { points: true } });
    expect(ledger._sum.points).toBe(after.balance);
    // "Lifetime earned" drops by exactly what was taken back; redemptions are untouched.
    const taken = before.balance - after.balance;
    expect(after.lifetimeEarned).toBe(before.lifetimeEarned - taken);
    expect(after.lifetimeRedeemed).toBe(before.lifetimeRedeemed);
    expect(after.balance).toBe(after.lifetimeEarned - after.lifetimeRedeemed - after.lifetimeExpired);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(customer.totalSpend).toBe(customerBefore.totalSpend - 42_000);

    await expect(refundOrder(systemContext(restaurantId), { orderId: firstOrderId, amount: 1, method: "CASH", reason: "Again" })).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("refunding an order paid partly with points returns them and lowers \"redeemed\"", async () => {
    const before = (await loyaltyOf())!;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: redeemOrderId } });
    await refundOrder(systemContext(restaurantId), { orderId: order.id, amount: order.paidTotal, method: "CASH", reason: "Cold food" });

    const after = (await loyaltyOf())!;
    // The 100 redeemed points come back first, then what this order earned is taken back.
    const taken = Math.min(order.loyaltyPointsEarned, before.balance + 100);
    expect(after.balance).toBe(before.balance + 100 - taken);
    expect(after.lifetimeRedeemed).toBe(before.lifetimeRedeemed - 100);
    expect(after.lifetimeEarned).toBe(before.lifetimeEarned - taken);
    expect(after.balance).toBe(after.lifetimeEarned - after.lifetimeRedeemed - after.lifetimeExpired);

    const reversals = await prisma.loyaltyTransaction.findMany({ where: { orderId: order.id, type: "REVERSAL" } });
    expect(reversals.map((r) => r.points).sort((x, y) => y - x)).toEqual([100, -taken]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemContext } from "@/server/auth/load-context";
import { prisma } from "@/server/db";
import { kitchenBoard } from "@/server/services/order-queries";
import { checkout, recordPayments, saveOrder, updateOrderStatus } from "@/server/services/orders";
import { tenantDb } from "@/server/tenant-db";
import { addMember, cleanup, ensureTestPlans, makeRecipeProduct, makeRestaurant, signIn } from "./helpers";

/**
 * Food status and payment are separate: paying sends an order to the kitchen, the kitchen
 * takes it New → Preparing → Ready → Complete, and an order only closes once it is both
 * handed over and paid. Table service can still order first and pay after the meal.
 */
describe("kitchen board flow", () => {
  let restaurantId: string;
  let cashier: Awaited<ReturnType<typeof signIn>>["ctx"];
  let kitchen: Awaited<ReturnType<typeof signIn>>["ctx"];
  let productId: string;
  let ingredientId: string;
  let dessertId: string;

  const stockOf = async () => (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock;
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const tableOf = (id: string) => prisma.diningTable.findUniqueOrThrow({ where: { id } });
  const tables = () => tenantDb(restaurantId).diningTable.findMany({ orderBy: { sortOrder: "asc" } });
  const cook = async (orderId: string) => {
    await updateOrderStatus(kitchen, orderId, "PREPARING");
    await updateOrderStatus(kitchen, orderId, "READY");
    return updateOrderStatus(kitchen, orderId, "SERVED");
  };

  beforeAll(async () => {
    await ensureTestPlans();
    const r = await makeRestaurant("Kilo Kitchen", { tables: 4 });
    restaurantId = r.restaurant.id;
    const made = await makeRecipeProduct(systemContext(restaurantId), { stock: 3, perPortionGrams: 100, price: 20_000 });
    productId = made.product.id;
    ingredientId = made.ingredient.id;
    const category = await tenantDb(restaurantId).category.findFirstOrThrow();
    dessertId = (await tenantDb(restaurantId).product.create({ data: { restaurantId, categoryId: category.id, name: "Gulab Jamun", sku: "DS-GJ-KF", price: 9_000 } })).id;
    cashier = (await signIn((await addMember(restaurantId, "Cashier", "cashier")).user.id, restaurantId)).ctx;
    kitchen = (await signIn((await addMember(restaurantId, "Kitchen Staff", "chef")).user.id, restaurantId)).ctx;
  });

  afterAll(cleanup);

  it("new restaurants use the kitchen board", async () => {
    const settings = await prisma.restaurantSettings.findUniqueOrThrow({ where: { restaurantId } });
    expect(settings.autoCompleteOnPayment).toBe(false);
  });

  it("paying at the counter sends the order to the kitchen instead of closing it", async () => {
    const stockBefore = await stockOf();
    const paid = await checkout(cashier, { type: "TAKEAWAY", items: [{ productId, quantity: 1 }], payments: [{ method: "UPI", amount: 21_000, reference: "UPI-9" }] });

    expect(paid).toMatchObject({ status: "NEW", paymentStatus: "PAID", inventoryDeducted: false });
    expect(await stockOf()).toBeCloseTo(stockBefore, 5);
    expect((await kitchenBoard(kitchen)).map((o) => o.id)).toContain(paid.id);

    const done = await cook(paid.id);
    expect(done.status).toBe("COMPLETED");
    expect((await orderOf(paid.id)).inventoryDeducted).toBe(true);
    expect(await stockOf()).toBeCloseTo(stockBefore - 0.1, 5);
    expect((await kitchenBoard(kitchen)).map((o) => o.id)).not.toContain(paid.id);
  });

  it("kitchen tickets carry no prices or payment details", async () => {
    const order = await checkout(cashier, { type: "TAKEAWAY", items: [{ productId, quantity: 2 }], payments: [{ method: "CASH", amount: 42_000 }] });
    const ticket = (await kitchenBoard(kitchen)).find((o) => o.id === order.id)!;
    const keys = [...Object.keys(ticket), ...Object.keys(ticket.items[0]!)];
    for (const k of ["total", "paidTotal", "paymentStatus", "subtotal", "unitPrice", "lineTotal", "taxAmount"]) expect(keys).not.toContain(k);
    expect(JSON.stringify(ticket)).not.toMatch(/42000|21000|20000/);
    await cook(order.id);
  });

  it("a table can order first and pay after the meal", async () => {
    const [table] = await tables();
    const order = await saveOrder(cashier, { type: "DINE_IN", tableId: table!.id, guests: 2, items: [{ productId, quantity: 1 }] }, "KITCHEN");
    expect(order).toMatchObject({ status: "NEW", paymentStatus: "UNPAID" });

    const served = await cook(order.id);
    expect(served.status).toBe("SERVED");
    expect((await tableOf(table!.id)).status).toBe("OCCUPIED");
    expect((await kitchenBoard(kitchen)).map((o) => o.id)).not.toContain(order.id);

    const settled = await recordPayments(cashier, order.id, [{ method: "CARD", amount: order.total }]);
    expect(settled.status).toBe("COMPLETED");
    expect((await tableOf(table!.id)).status).toBe("AVAILABLE");
  });

  it("more food for a served table goes back on the board, with earlier dishes marked served", async () => {
    const [, table] = await tables();
    const first = await saveOrder(cashier, { type: "DINE_IN", tableId: table!.id, items: [{ productId, quantity: 2 }] }, "KITCHEN");
    await cook(first.id);
    expect((await orderOf(first.id)).status).toBe("SERVED");

    const more = await saveOrder(
      cashier,
      { orderId: first.id, type: "DINE_IN", tableId: table!.id, items: [{ productId, quantity: 2 }, { productId: dessertId, quantity: 1 }] },
      "KITCHEN",
    );
    expect(more.status).toBe("NEW");

    const ticket = (await kitchenBoard(kitchen)).find((o) => o.id === first.id)!;
    const main = ticket.items.find((i) => i.name === "Paneer Tikka")!;
    const dessert = ticket.items.find((i) => i.name === "Gulab Jamun")!;
    expect(main).toMatchObject({ served: true, added: false });
    expect(dessert).toMatchObject({ served: false, added: true });

    // Paying before the dessert is served keeps it with the kitchen; serving it closes the bill.
    const paid = await recordPayments(cashier, first.id, [{ method: "CASH", amount: more.total }]);
    expect(paid.status).toBe("NEW");
    expect((await cook(first.id)).status).toBe("COMPLETED");
  });

  it("a table that paid up front keeps its table after the kitchen completes", async () => {
    const [, , table] = await tables();
    const order = await checkout(cashier, { type: "DINE_IN", tableId: table!.id, items: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 21_000 }] });
    expect(order).toMatchObject({ status: "NEW", paymentStatus: "PAID" });

    expect((await cook(order.id)).status).toBe("COMPLETED");
    // Guests are still eating: staff free the table when they leave.
    expect((await tableOf(table!.id)).status).toBe("OCCUPIED");
  });

  it("counters without a kitchen screen can still close paid orders at once", async () => {
    await prisma.restaurantSettings.update({ where: { restaurantId }, data: { autoCompleteOnPayment: true } });
    const order = await checkout(cashier, { type: "TAKEAWAY", items: [{ productId, quantity: 1 }], payments: [{ method: "CASH", amount: 21_000 }] });
    expect(order.status).toBe("COMPLETED");
    await prisma.restaurantSettings.update({ where: { restaurantId }, data: { autoCompleteOnPayment: false } });
  });
});

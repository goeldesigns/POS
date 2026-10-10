import type { Prisma } from "../../src/generated/prisma/client";
import type { ExpenseCategory, PaymentMethod, StockTxnType } from "../../src/generated/prisma/enums";
import { prisma } from "../../src/server/db";
import type { IngredientSeed } from "./menus";
import { RESERVATION_NOTES } from "./people";
import type { Random } from "./random";
import { seedId } from "./random";
import { addMinutes, dateOnly, daysAgo, istAt, istMidnight } from "./time";
import { insertMany } from "./history";

// ─── Expenses ───────────────────────────────────────────────────────────────

interface ExpenseScale {
  rent: number;
  salaries: number;
  electricity: number;
  marketing: number;
  rawWeekly: number;
}

export async function seedExpenses(rnd: Random, restaurantId: string, scale: ExpenseScale, createdById: string, months = 4) {
  const rows: Prisma.ExpenseCreateManyInput[] = [];
  const add = (title: string, category: ExpenseCategory, amount: number, day: number, method: PaymentMethod, vendor?: string, notes?: string) => {
    if (day < 0) return;
    rows.push({
      id: seedId("exp"), restaurantId, title, category, amount: Math.round(amount) * 100, date: dateOnly(day),
      paymentMethod: method, vendor: vendor ?? null, notes: notes ?? null, createdById, createdAt: daysAgo(day),
    });
  };

  const today = new Date();
  for (let m = 0; m < months; m++) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1, 12));
    const dayOffset = Math.floor((today.getTime() - first.getTime()) / 86_400_000);
    const monthName = first.toLocaleString("en-IN", { month: "long" });
    add(`Rent — ${monthName}`, "RENT", scale.rent, dayOffset, "OTHER", "Property owner (lease)", "Bank transfer, lease ref. LSE-2024-118");
    add(`Staff salaries — ${monthName}`, "SALARY", scale.salaries * rnd.jitter(0.03), dayOffset - 1, "OTHER", "Payroll", "NEFT batch");
    add("Electricity bill", "UTILITIES", scale.electricity * rnd.jitter(0.12), dayOffset - 8, "UPI", "Electricity board");
    add("Water supply", "UTILITIES", 4800 * rnd.jitter(0.2), dayOffset - 10, "UPI", "Water board");
    add("Internet & phone", "UTILITIES", 2499, dayOffset - 5, "CARD", "Broadband provider");
    add("Instagram & Google ads", "MARKETING", scale.marketing * rnd.jitter(0.2), dayOffset - 12, "CARD", "Meta / Google Ads");
    add("Pest control (monthly)", "MAINTENANCE", 3500, dayOffset - 15, "UPI", "SafeHome Pest Services");
    add("POS software subscription", "OTHER", 3999, dayOffset - 2, "CARD", "Tabla");
    for (let w = 0; w < 4; w++) {
      add("Commercial LPG cylinders", "UTILITIES", 4 * 1850 * rnd.jitter(0.1), dayOffset - 3 - w * 7, "CASH", "Gas agency");
      add("Vegetables & dairy (weekly)", "RAW_MATERIALS", scale.rawWeekly * rnd.jitter(0.15), dayOffset - 4 - w * 7, "UPI", "Green Basket Produce");
      add("Local deliveries & porter", "TRANSPORT", rnd.int(600, 1600), dayOffset - 6 - w * 7, "CASH", "Porter");
    }
  }
  add("AC servicing (4 units)", "MAINTENANCE", 6800, 21, "UPI", "CoolCare Services");
  add("Kitchen exhaust deep cleaning", "MAINTENANCE", 9200, 46, "UPI", "DuctPro Cleaning");
  add("Menu card reprint (200 copies)", "MARKETING", 3600, 33, "CASH", "Print Point");
  add("Plumbing repair — dishwash area", "MAINTENANCE", 2200, 9, "CASH", "Local plumber");
  add("Festive décor", "OTHER", 5400, 4, "CARD", "Decor Studio");

  await insertMany("expenses", rows, (b) => prisma.expense.createMany({ data: b }));
}

// ─── Inventory ledger & purchases ───────────────────────────────────────────

export async function seedInventoryLedger(
  rnd: Random,
  restaurantId: string,
  ingredients: { id: string; seed: IngredientSeed; supplierId: string | null }[],
  actor: { id: string; name: string },
) {
  const final = new Map(ingredients.map((i) => [i.id, i.seed.stock]));
  type Entry = { ingredientId: string; type: StockTxnType; delta: number; at: Date; reference?: string; reason?: string; counterparty?: string; unitCost: number; purchaseId?: string };
  const entries: Entry[] = [];

  // Purchases: group ingredients by supplier, receive every few days.
  const bySupplier = new Map<string, typeof ingredients>();
  for (const i of ingredients) {
    if (!i.supplierId) continue;
    bySupplier.set(i.supplierId, [...(bySupplier.get(i.supplierId) ?? []), i]);
  }
  const purchases: Prisma.PurchaseCreateManyInput[] = [];
  const purchaseItems: Prisma.PurchaseItemCreateManyInput[] = [];
  let poNumber = 1;
  const supplierIds = [...bySupplier.keys()];
  const schedule = [27, 24, 21, 18, 15, 12, 9, 6, 4, 2];
  schedule.forEach((day, idx) => {
    const supplierId = supplierIds[idx % supplierIds.length]!;
    const pool = bySupplier.get(supplierId)!;
    const lines = pool.filter(() => rnd.chance(0.75)).slice(0, 7);
    if (!lines.length) return;
    const id = seedId("po");
    const at = istAt(day, 9, rnd.int(0, 50));
    let subtotal = 0;
    for (const l of lines) {
      const qty = Math.max(1, Math.round((l.seed.max ?? l.seed.min * 3) * 0.4 * rnd.jitter(0.3) * 10) / 10);
      const unitCost = Math.round(l.seed.cost * 100 * rnd.jitter(0.05));
      const total = Math.round(qty * unitCost);
      subtotal += total;
      purchaseItems.push({ id: seedId("pi"), restaurantId, purchaseId: id, ingredientId: l.id, quantity: qty, unit: l.seed.unit, unitCost, total });
      entries.push({ ingredientId: l.id, type: "PURCHASE", delta: qty, at, reference: `PO-${String(poNumber).padStart(4, "0")}`, reason: "Goods received", unitCost, purchaseId: id });
    }
    const tax = Math.round(subtotal * 0.05);
    purchases.push({
      id, restaurantId, supplierId, reference: `PO-${String(poNumber).padStart(4, "0")}`, invoiceNumber: `INV/${rnd.int(1000, 9999)}`,
      status: "RECEIVED", orderedAt: addMinutes(at, -1440), receivedAt: at, subtotal, taxAmount: tax, total: subtotal + tax,
      createdById: actor.id, createdAt: addMinutes(at, -1440),
    });
    poNumber++;
  });

  // One open purchase order and one draft — stock not yet received.
  for (const [status, day] of [["ORDERED", 1], ["DRAFT", 0]] as const) {
    const supplierId = supplierIds[poNumber % supplierIds.length]!;
    const pool = bySupplier.get(supplierId)!.slice(0, 4);
    const id = seedId("po");
    let subtotal = 0;
    for (const l of pool) {
      const qty = Math.max(1, Math.round(l.seed.min * 2));
      const unitCost = l.seed.cost * 100;
      subtotal += qty * unitCost;
      purchaseItems.push({ id: seedId("pi"), restaurantId, purchaseId: id, ingredientId: l.id, quantity: qty, unit: l.seed.unit, unitCost, total: qty * unitCost });
    }
    purchases.push({
      id, restaurantId, supplierId, reference: `PO-${String(poNumber).padStart(4, "0")}`, status,
      orderedAt: status === "ORDERED" ? daysAgo(day) : null, subtotal, taxAmount: Math.round(subtotal * 0.05),
      total: subtotal + Math.round(subtotal * 0.05), notes: status === "ORDERED" ? "Expected tomorrow morning" : "Weekend top-up — confirm quantities",
      createdById: actor.id, createdAt: daysAgo(day),
    });
    poNumber++;
  }

  // Waste, adjustments and transfers.
  const find = (sku: string) => ingredients.find((i) => i.seed.sku === sku);
  const extra: [string, StockTxnType, number, number, string, string?][] = [
    ["ING-PNR", "WASTE", -0.5, 11, "Expired"],
    ["ING-MLK", "WASTE", -2, 8, "Spilled"],
    ["ING-TOM", "WASTE", -3, 5, "Spoiled"],
    ["ING-LET", "WASTE", -0.4, 2, "Expired"],
    ["ING-CRM", "WASTE", -0.5, 1, "Spoiled"],
    ["ING-ONI", "ADJUSTMENT", -1.5, 14, "Stock count correction"],
    ["ING-BAS", "ADJUSTMENT", 2, 10, "Stock count correction"],
    ["ING-OIL", "ADJUSTMENT", -1, 3, "Stock count correction"],
    ["ING-ONI", "TRANSFER_OUT", -5, 7, "Sent to sister kitchen", "Indiranagar outlet"],
    ["ING-BAS", "TRANSFER_IN", 10, 6, "Received from central store", "Central store"],
    ["BR-MLK", "WASTE", -1.5, 3, "Expired"],
    ["BR-MUF", "WASTE", -3, 1, "Expired"],
  ];
  const wastes: Prisma.WasteCreateManyInput[] = [];
  for (const [sku, type, delta, day, reason, counterparty] of extra) {
    const ing = find(sku);
    if (!ing) continue;
    const at = istAt(day, 22, rnd.int(0, 40));
    entries.push({ ingredientId: ing.id, type, delta, at, reason, counterparty, unitCost: ing.seed.cost * 100 });
    if (type === "WASTE") {
      wastes.push({
        id: seedId("w"), restaurantId, ingredientId: ing.id, quantity: Math.abs(delta), unit: ing.seed.unit, reason,
        cost: Math.round(Math.abs(delta) * ing.seed.cost * 100), recordedBy: actor.name, createdAt: at,
      });
    }
  }

  // Opening balances make each ledger add up to the configured stock level.
  const openingAt = istAt(30, 8);
  const txns: Prisma.StockTransactionCreateManyInput[] = [];
  for (const ing of ingredients) {
    const own = entries.filter((e) => e.ingredientId === ing.id).sort((a, b) => a.at.getTime() - b.at.getTime());
    const sum = own.reduce((s, e) => s + e.delta, 0);
    let balance = Math.max(0, Math.round((final.get(ing.id)! - sum) * 1000) / 1000);
    txns.push({
      id: seedId("st"), restaurantId, ingredientId: ing.id, type: "OPENING", quantity: balance, balanceAfter: balance,
      unitCost: ing.seed.cost * 100, reason: "Opening stock", actorName: actor.name, createdById: actor.id, createdAt: openingAt,
    });
    for (const e of own) {
      balance = Math.round((balance + e.delta) * 1000) / 1000;
      txns.push({
        id: seedId("st"), restaurantId, ingredientId: ing.id, type: e.type, quantity: e.delta, balanceAfter: balance,
        unitCost: e.unitCost, reference: e.reference ?? null, reason: e.reason ?? null, counterparty: e.counterparty ?? null,
        purchaseId: e.purchaseId ?? null, actorName: actor.name, createdById: actor.id, createdAt: e.at,
      });
    }
    if (Math.abs(balance - final.get(ing.id)!) > 0.0005) {
      const delta = Math.round((final.get(ing.id)! - balance) * 1000) / 1000;
      txns.push({
        id: seedId("st"), restaurantId, ingredientId: ing.id, type: "ADJUSTMENT", quantity: delta, balanceAfter: final.get(ing.id)!,
        unitCost: ing.seed.cost * 100, reason: "Stock count correction", actorName: actor.name, createdById: actor.id, createdAt: istAt(0, 9),
      });
    }
  }

  await insertMany("purchases", purchases, (b) => prisma.purchase.createMany({ data: b }));
  await insertMany("purchase lines", purchaseItems, (b) => prisma.purchaseItem.createMany({ data: b }));
  await insertMany("waste records", wastes, (b) => prisma.waste.createMany({ data: b }));
  await insertMany("stock ledger entries", txns, (b) => prisma.stockTransaction.createMany({ data: b }));
  await prisma.restaurantSettings.update({ where: { restaurantId }, data: { nextPurchaseNumber: poNumber } });
}

// ─── Reservations ───────────────────────────────────────────────────────────

export async function seedReservations(
  rnd: Random,
  restaurantId: string,
  customers: { id: string; name: string; phone: string; email: string | null }[],
  tables: { id: string; capacity: number; name: string }[],
  createdById: string,
) {
  const rows: Prisma.ReservationCreateManyInput[] = [];
  const sources = ["Phone", "Walk-in", "Website", "Google", "Instagram"];
  const make = (day: number, hour: number, minute: number, status: Prisma.ReservationCreateManyInput["status"], opts: { tableId?: string | null; party?: number } = {}) => {
    const c = rnd.pick(customers);
    const party = opts.party ?? rnd.weighted([2, 2, 3, 4, 4, 5, 6, 8], () => 1);
    const table = opts.tableId !== undefined ? opts.tableId : status === "PENDING" ? null : tables.find((t) => t.capacity >= party)?.id ?? null;
    rows.push({
      id: seedId("res"), restaurantId, customerId: c.id, tableId: table, customerName: c.name, customerPhone: c.phone,
      customerEmail: c.email, startsAt: istAt(day, hour, minute), durationMinutes: party > 5 ? 120 : 90, partySize: party,
      status, source: rnd.pick(sources), notes: rnd.pick(RESERVATION_NOTES), createdById,
      seatedAt: status === "SEATED" || status === "COMPLETED" ? istAt(day, hour, minute + rnd.int(0, 10)) : null,
      createdAt: istAt(Math.max(day, 0) + rnd.int(1, 5), 11, 0),
    });
  };

  for (let d = 7; d >= 1; d--) {
    for (let i = 0; i < rnd.int(2, 4); i++) {
      const r = rnd.next();
      make(d, rnd.pick([13, 19, 20, 21]), rnd.pick([0, 30]), r < 0.8 ? "COMPLETED" : r < 0.9 ? "NO_SHOW" : "CANCELLED");
    }
  }
  const private1 = tables.find((t) => t.name.startsWith("P1"));
  const reservedTable = tables.find((t) => t.name === "T10");
  make(0, 13, 0, "COMPLETED");
  make(0, 19, 30, "CONFIRMED", { tableId: reservedTable?.id ?? null, party: 4 });
  make(0, 20, 0, "CONFIRMED", { tableId: private1?.id ?? null, party: 8 });
  make(0, 20, 30, "CONFIRMED");
  make(0, 21, 0, "PENDING");
  make(0, 21, 30, "PENDING", { party: 2 });
  for (let d = -1; d >= -14; d--) {
    for (let i = 0; i < rnd.int(1, 3); i++) make(d, rnd.pick([12, 13, 19, 20, 21]), rnd.pick([0, 30]), rnd.chance(0.6) ? "CONFIRMED" : "PENDING");
  }
  await insertMany("reservations", rows, (b) => prisma.reservation.createMany({ data: b }));
}

// ─── Staff, attendance, shifts ──────────────────────────────────────────────

export async function seedStaffRecords(
  rnd: Random,
  restaurantId: string,
  staff: { id: string; roleTitle: string }[],
) {
  const attendance: Prisma.AttendanceCreateManyInput[] = [];
  const shifts: Prisma.ShiftCreateManyInput[] = [];
  for (const s of staff) {
    const evening = ["Waiter", "Bartender", "Chef", "Kitchen Helper"].includes(s.roleTitle) && rnd.chance(0.5);
    const [start, end] = evening ? ["15:00", "23:30"] : ["09:30", "18:00"];
    for (let d = 13; d >= 0; d--) {
      const r = rnd.next();
      const status = d === 0 && r < 0.1 ? "PRESENT" : r < 0.86 ? "PRESENT" : r < 0.93 ? "LATE" : r < 0.97 ? "LEAVE" : "ABSENT";
      const [sh, sm] = start.split(":").map(Number) as [number, number];
      const [eh, em] = end.split(":").map(Number) as [number, number];
      const clockIn = status === "PRESENT" || status === "LATE" ? istAt(d, sh, sm + (status === "LATE" ? rnd.int(15, 50) : rnd.int(-10, 8))) : null;
      const clockOut = clockIn && d > 0 ? istAt(d, eh, em + rnd.int(-15, 25)) : null;
      attendance.push({ id: seedId("att"), restaurantId, staffId: s.id, date: dateOnly(d), status, clockIn, clockOut });
    }
    for (let d = -6; d <= 0; d++) {
      if (rnd.chance(0.14)) continue;
      shifts.push({
        id: seedId("sh"), restaurantId, staffId: s.id, date: dateOnly(d), startTime: start, endTime: end,
        station: s.roleTitle.includes("Chef") || s.roleTitle.includes("Kitchen") ? "Main Kitchen" : s.roleTitle === "Bartender" ? "Bar" : "Floor",
      });
    }
  }
  await insertMany("attendance records", attendance, (b) => prisma.attendance.createMany({ data: b }));
  await insertMany("shifts", shifts, (b) => prisma.shift.createMany({ data: b }));
}

// ─── Historical audit trail ─────────────────────────────────────────────────

export async function seedAuditTrail(
  rnd: Random,
  restaurantId: string,
  actors: { id: string; name: string; role: string }[],
  samples: { action: string; entity: string; summary: (actor: string) => string; roles: string[] }[],
) {
  const rows: Prisma.AuditLogCreateManyInput[] = [];
  for (let i = 0; i < 48; i++) {
    const sample = rnd.pick(samples);
    const pool = actors.filter((a) => sample.roles.includes(a.role));
    const actor = pool.length ? rnd.pick(pool) : actors[0]!;
    const day = rnd.int(0, 14);
    rows.push({
      id: seedId("al"), scope: "RESTAURANT", restaurantId, userId: actor.id, actorName: actor.name, actorRole: actor.role,
      action: sample.action, entity: sample.entity, summary: sample.summary(actor.name),
      ipAddress: `49.37.${rnd.int(1, 254)}.${rnd.int(1, 254)}`, createdAt: istAt(day, rnd.int(10, 22), rnd.int(0, 59)),
    });
  }
  await insertMany("audit entries", rows, (b) => prisma.auditLog.createMany({ data: b }));
}

export { istMidnight };

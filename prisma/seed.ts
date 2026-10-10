/**
 * Development / demo seed. All data is fictional and clearly demo-only.
 *   npm run db:reset   (drops, migrates and seeds)
 *   npm run db:seed    (seed an empty, migrated database)
 */
import "dotenv/config";
import type { OrderType } from "../src/generated/prisma/enums";
import { MODULE_KEYS, PLAN_FLAGS, type ModuleKey } from "../src/lib/permissions/catalog";
import { prisma } from "../src/server/db";
import { tenantDb } from "../src/server/tenant-db";
import type { ServiceContext } from "../src/server/auth/load-context";
import { hashPassword } from "../src/server/auth/password";
import { syncPermissionCatalog } from "../src/server/services/catalog-sync";
import { createRestaurantTenant } from "../src/server/services/onboarding";
import { createMember, setMemberPermissions } from "../src/server/services/members";
import { checkout, saveOrder, updateOrderStatus } from "../src/server/services/orders";
import { generateOrderHistory, insertMany, type SeededProduct } from "./seed/history";
import {
  BREW_INGREDIENTS, BREW_MENU, BREW_MODIFIERS, BREW_SUPPLIERS, COASTAL_MENU, SPICE_INGREDIENTS, SPICE_MENU,
  SPICE_MODIFIERS, SPICE_SUPPLIERS, type IngredientSeed, type MenuItemSeed, type ModifierGroupSeed, type SupplierSeed,
} from "./seed/menus";
import { seedAuditTrail, seedExpenses, seedInventoryLedger, seedReservations, seedStaffRecords } from "./seed/operations";
import { CUSTOMER_NAMES, emailFor, phoneFor, STAFF_ONLY } from "./seed/people";
import { createRandom, seedId } from "./seed/random";
import { addMinutes, dateOnly, daysAgo } from "./seed/time";

const DEMO_PASSWORD = "Demo@1234";
const ADMIN_PASSWORD = "Admin@12345";
const rnd = createRandom();

// ─── Plans ──────────────────────────────────────────────────────────────────

const STARTER_MODULES: ModuleKey[] = ["overview", "pos", "orders", "tables", "menu", "customers", "reports", "settings"];
const PRO_MODULES: ModuleKey[] = [...STARTER_MODULES, "reservations", "expenses", "staff", "recipes", "inventory", "loyalty"];

async function seedPlans() {
  const plans = [
    { key: "starter", name: "Starter", description: "Billing, orders and menu for a single counter or small café.", priceMonthly: 149900, priceYearly: 1499000, trialDays: 14, maxUsers: 5, maxTables: 15, maxProducts: 150, maxLocations: 1, sortOrder: 1, modules: STARTER_MODULES, flags: [] as string[] },
    { key: "professional", name: "Professional", description: "Full restaurant operations: inventory, recipes, staff, reservations and loyalty.", priceMonthly: 399900, priceYearly: 3999000, trialDays: 14, maxUsers: 20, maxTables: 60, maxProducts: 600, maxLocations: 1, sortOrder: 2, modules: PRO_MODULES, flags: ["custom_roles"] },
    { key: "enterprise", name: "Enterprise", description: "Aggregator integrations, advanced analytics, API access and multi-location readiness.", priceMonthly: 899900, priceYearly: 8999000, trialDays: 30, maxUsers: null, maxTables: null, maxProducts: null, maxLocations: 10, sortOrder: 3, modules: MODULE_KEYS, flags: Object.keys(PLAN_FLAGS) },
  ];
  for (const p of plans) {
    const { modules, flags, ...data } = p;
    await prisma.plan.create({
      data: {
        ...data,
        features: {
          create: [
            ...MODULE_KEYS.map((m) => ({ featureKey: m, enabled: modules.includes(m) })),
            ...Object.keys(PLAN_FLAGS).map((f) => ({ featureKey: f, enabled: flags.includes(f) })),
          ],
        },
      },
    });
  }
  await prisma.plan.create({
    data: {
      key: "legacy-basic", name: "Legacy Basic", description: "Retired 2025 plan kept for existing customers.", priceMonthly: 99900,
      priceYearly: 999000, trialDays: 0, maxUsers: 3, maxTables: 10, isActive: false, isPublic: false, sortOrder: 9,
      features: { create: MODULE_KEYS.map((m) => ({ featureKey: m, enabled: ["overview", "pos", "orders", "menu", "settings"].includes(m) })) },
    },
  });
}

// ─── Restaurant configuration ───────────────────────────────────────────────

interface MemberSeed {
  name: string;
  email: string;
  phone: string;
  role: string;
  grant?: string[];
  deny?: string[];
}

interface RestaurantSeed {
  key: string;
  createdDaysAgo: number;
  profile: Parameters<typeof createRestaurantTenant>[0]["profile"];
  serviceChargePercent: number;
  planKey: string;
  billing: { status: "ACTIVE" | "TRIALING" | "PAST_DUE"; interval: "MONTHLY" | "YEARLY" };
  modules?: ModuleKey[];
  owner: { name: string; email: string; phone: string };
  members: MemberSeed[];
  menu: MenuItemSeed[];
  modifiers: ModifierGroupSeed[];
  suppliers: SupplierSeed[];
  ingredients: IngredientSeed[];
  floors: { name: string; tables: [name: string, capacity: number, shape: "SQUARE" | "ROUND" | "RECTANGLE"][] }[];
  customers: number;
  history: { days: number; baseDaily: number; typeMix: Partial<Record<OrderType, number>> };
  extras: { expenses?: { rent: number; salaries: number; electricity: number; marketing: number; rawWeekly: number }; staff?: boolean; reservations?: boolean; liveOrders?: boolean; coupons?: boolean };
}

const RESTAURANTS: RestaurantSeed[] = [
  {
    key: "spice",
    createdDaysAgo: 214,
    profile: {
      name: "Spice & Stone", legalName: "Spice & Stone Hospitality LLP", ownerName: "Arjun Kapoor", email: "hello@spiceandstone.demo",
      phone: "9845011122", addressLine: "No. 42, 5th Block, 80 Feet Road, Koramangala", city: "Bengaluru", state: "Karnataka",
      country: "India", postalCode: "560095", gstNumber: "29AAKFS4821R1Z6", fssaiNumber: "11224333000412",
      currency: "INR", timezone: "Asia/Kolkata", restaurantType: "Casual Dining",
    },
    serviceChargePercent: 5,
    planKey: "enterprise",
    billing: { status: "ACTIVE", interval: "YEARLY" },
    owner: { name: "Arjun Kapoor", email: "owner@spiceandstone.demo", phone: "9845011122" },
    members: [
      { name: "Neha Verma", email: "manager@spiceandstone.demo", phone: "9845022233", role: "Manager" },
      { name: "Rahul Sharma", email: "cashier@spiceandstone.demo", phone: "9845033344", role: "Cashier", grant: ["reports.view"] },
      { name: "Vikram Singh", email: "waiter@spiceandstone.demo", phone: "9845044455", role: "Waiter" },
      { name: "Sunita Rao", email: "kitchen@spiceandstone.demo", phone: "9845055566", role: "Kitchen Staff" },
      { name: "Karan Malhotra", email: "accounts@spiceandstone.demo", phone: "9845066677", role: "Accountant" },
      { name: "Deepa Nair", email: "inventory@spiceandstone.demo", phone: "9845077788", role: "Inventory Manager" },
    ],
    menu: SPICE_MENU,
    modifiers: SPICE_MODIFIERS,
    suppliers: SPICE_SUPPLIERS,
    ingredients: SPICE_INGREDIENTS,
    floors: [
      { name: "Main Hall", tables: Array.from({ length: 12 }, (_, i) => [`T${String(i + 1).padStart(2, "0")}`, i % 4 === 0 ? 2 : i % 4 === 3 ? 6 : 4, i % 4 === 3 ? "RECTANGLE" : "SQUARE"] as [string, number, "SQUARE" | "RECTANGLE"]) },
      { name: "Outdoor", tables: [["O1", 4, "ROUND"], ["O2", 4, "ROUND"], ["O3", 2, "ROUND"], ["O4", 2, "ROUND"], ["O5", 6, "RECTANGLE"], ["O6", 4, "ROUND"]] },
      { name: "Private Dining", tables: [["P1", 10, "RECTANGLE"], ["P2", 8, "RECTANGLE"]] },
      { name: "Bar", tables: [["B1", 2, "ROUND"], ["B2", 2, "ROUND"], ["B3", 3, "ROUND"], ["B4", 4, "SQUARE"]] },
    ],
    customers: 60,
    history: { days: 90, baseDaily: 44, typeMix: { DINE_IN: 56, TAKEAWAY: 18, DELIVERY: 10, ONLINE: 16 } },
    extras: { expenses: { rent: 185000, salaries: 342000, electricity: 41000, marketing: 14000, rawWeekly: 52000 }, staff: true, reservations: true, liveOrders: true, coupons: true },
  },
  {
    key: "brew",
    createdDaysAgo: 124,
    profile: {
      name: "The Brew Room", legalName: "Brew Room Cafés Pvt Ltd", ownerName: "Priya Mehta", email: "hello@brewroom.demo",
      phone: "9822033445", addressLine: "Lane 6, North Main Road, Koregaon Park", city: "Pune", state: "Maharashtra",
      country: "India", postalCode: "411001", gstNumber: "27AAGCB7731K1ZQ", fssaiNumber: "11523998000187",
      currency: "INR", timezone: "Asia/Kolkata", restaurantType: "Cafe",
    },
    serviceChargePercent: 0,
    planKey: "professional",
    billing: { status: "ACTIVE", interval: "MONTHLY" },
    owner: { name: "Priya Mehta", email: "owner@brewroom.demo", phone: "9822033445" },
    members: [
      { name: "Neha Verma", email: "manager@spiceandstone.demo", phone: "9845022233", role: "Manager" },
      { name: "Aditya Joshi", email: "cashier@brewroom.demo", phone: "9822044556", role: "Cashier" },
    ],
    menu: BREW_MENU,
    modifiers: BREW_MODIFIERS,
    suppliers: BREW_SUPPLIERS,
    ingredients: BREW_INGREDIENTS,
    floors: [
      { name: "Main Hall", tables: [["C1", 2, "ROUND"], ["C2", 2, "ROUND"], ["C3", 4, "SQUARE"], ["C4", 4, "SQUARE"], ["C5", 6, "RECTANGLE"], ["C6", 2, "ROUND"]] },
      { name: "Outdoor", tables: [["Patio 1", 4, "ROUND"], ["Patio 2", 4, "ROUND"]] },
    ],
    customers: 28,
    history: { days: 60, baseDaily: 34, typeMix: { DINE_IN: 62, TAKEAWAY: 30, ONLINE: 8 } },
    extras: { expenses: { rent: 92000, salaries: 148000, electricity: 18000, marketing: 9000, rawWeekly: 21000 }, staff: false, reservations: false, liveOrders: false, coupons: false },
  },
  {
    key: "coastal",
    createdDaysAgo: 76,
    profile: {
      name: "Coastal Curry Co.", legalName: "Coastal Curry Foods", ownerName: "Rohan Desai", email: "contact@coastalcurry.demo",
      phone: "9819055667", addressLine: "Shop 3, Hill Road, Bandra West", city: "Mumbai", state: "Maharashtra",
      country: "India", postalCode: "400050", gstNumber: "27AAHFC2219P1Z3", fssaiNumber: "11521999000634",
      currency: "INR", timezone: "Asia/Kolkata", restaurantType: "Quick Service (QSR)",
    },
    serviceChargePercent: 0,
    planKey: "starter",
    billing: { status: "ACTIVE", interval: "MONTHLY" },
    owner: { name: "Rohan Desai", email: "owner@coastalcurry.demo", phone: "9819055667" },
    members: [{ name: "Sana Shaikh", email: "cashier@coastalcurry.demo", phone: "9819066778", role: "Cashier" }],
    menu: COASTAL_MENU,
    modifiers: [],
    suppliers: [],
    ingredients: [],
    floors: [{ name: "Main Hall", tables: [["1", 4, "SQUARE"], ["2", 4, "SQUARE"], ["3", 2, "SQUARE"], ["4", 2, "SQUARE"], ["5", 6, "RECTANGLE"]] }],
    customers: 18,
    history: { days: 45, baseDaily: 26, typeMix: { DINE_IN: 35, TAKEAWAY: 40, DELIVERY: 25 } },
    extras: {},
  },
];

// ─── Seeding a restaurant ───────────────────────────────────────────────────

async function seedRestaurant(cfg: RestaurantSeed) {
  console.log(`\n▸ ${cfg.profile.name}`);
  const created = await createRestaurantTenant({
    profile: cfg.profile,
    config: { numberOfTables: 0, taxRate: 5, taxInclusive: false, serviceChargePercent: cfg.serviceChargePercent, defaultOrderType: "DINE_IN" },
    owner: { ...cfg.owner, password: DEMO_PASSWORD },
    planKey: cfg.planKey,
    modules: cfg.modules ?? null,
  });
  const restaurantId = created.restaurant.id;
  const createdAt = daysAgo(cfg.createdDaysAgo);
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { createdAt, lastActiveAt: addMinutes(new Date(), -rnd.int(2, 40)) } });
  await prisma.user.update({ where: { id: created.owner.id }, data: { createdAt, lastLoginAt: addMinutes(new Date(), -rnd.int(10, 300)) } });
  await prisma.subscription.update({
    where: { restaurantId },
    data: {
      status: cfg.billing.status,
      billingInterval: cfg.billing.interval,
      trialEndsAt: null,
      currentPeriodStart: daysAgo(cfg.billing.interval === "YEARLY" ? 150 : 12),
      currentPeriodEnd: daysAgo(cfg.billing.interval === "YEARLY" ? -215 : -18),
      createdAt,
    },
  });

  const db = tenantDb(restaurantId);
  const ctx: ServiceContext = {
    restaurantId,
    db,
    actor: { userId: created.owner.id, name: cfg.owner.name, role: "Owner" },
    permissions: "all",
  };

  // Team
  const roles = await db.role.findMany();
  const roleId = (name: string) => roles.find((r) => r.name === name)!.id;
  const users: { id: string; name: string; role: string; memberId: string; email: string; phone: string }[] = [
    { id: created.owner.id, name: cfg.owner.name, role: "Owner", memberId: created.membershipId, email: cfg.owner.email, phone: cfg.owner.phone },
  ];
  for (const m of cfg.members) {
    const { member, user, attachedExisting } = await createMember(ctx, { name: m.name, email: m.email, phone: m.phone, password: DEMO_PASSWORD, roleId: roleId(m.role) });
    if (m.grant || m.deny) {
      const role = roles.find((r) => r.name === m.role)!;
      const rolePerms = (await prisma.rolePermission.findMany({ where: { roleId: role.id } })).map((p) => p.permissionKey);
      const desired = [...rolePerms.filter((p) => !(m.deny ?? []).includes(p)), ...(m.grant ?? [])];
      await setMemberPermissions(ctx, member.id, desired);
    }
    // Staff joined some time after the restaurant opened (keeps platform growth charts realistic).
    const joined = daysAgo(rnd.int(3, Math.max(4, cfg.createdDaysAgo - 3)));
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: addMinutes(new Date(), -rnd.int(30, 4000)), ...(attachedExisting ? {} : { createdAt: joined }) },
    });
    await prisma.restaurantUser.update({ where: { id: member.id }, data: { createdAt: joined } });
    users.push({ id: user.id, name: m.name, role: m.role, memberId: member.id, email: m.email, phone: m.phone });
  }

  // Menu
  const categories = await db.category.findMany();
  const categoryId = (name: string) => categories.find((c) => c.name === name)!.id;
  const taxRate = await db.taxRate.findFirstOrThrow({ where: { isDefault: true } });

  const groups = new Map<string, { id: string; modifiers: { id: string; name: string; price: number }[] }>();
  for (const [i, g] of cfg.modifiers.entries()) {
    const group = await db.modifierGroup.create({
      data: {
        restaurantId, name: g.name, minSelect: g.min, maxSelect: g.max, sortOrder: i,
        modifiers: { create: g.options.map(([name, price], j) => ({ restaurantId, name, price: price * 100, sortOrder: j })) },
      },
      include: { modifiers: true },
    });
    groups.set(g.name, { id: group.id, modifiers: group.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })) });
  }

  const products: SeededProduct[] = [];
  for (const [i, item] of cfg.menu.entries()) {
    const product = await db.product.create({
      data: {
        restaurantId, categoryId: categoryId(item.category), name: item.name, sku: item.sku, description: item.description ?? null,
        price: item.price * 100, imageUrl: item.image ?? null, foodType: item.foodType, isFeatured: item.featured ?? false,
        isBestseller: item.bestseller ?? false, isSpicy: item.spicy ?? false, isCombo: !!item.combo, preparationTime: item.prep ?? null,
        kitchenStation: item.station ?? null, sortOrder: i, trackStock: true, barcode: `890${String(1000000000 + i * 7919).slice(0, 10)}`,
        createdAt: addMinutes(createdAt, 60 + i),
        variants: item.variants
          ? { create: item.variants.map(([name, price], j) => ({ restaurantId, name, price: price * 100, isDefault: j === 0, sortOrder: j })) }
          : undefined,
        modifierGroups: item.modifiers
          ? { create: item.modifiers.filter((n) => groups.has(n)).map((n) => ({ modifierGroupId: groups.get(n)!.id })) }
          : undefined,
      },
      include: { variants: true },
    });
    products.push({
      id: product.id,
      seed: item,
      categoryName: item.category,
      variants: product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
      modifiers: (item.modifiers ?? []).flatMap((n) => groups.get(n)?.modifiers ?? []).filter((m) => m.price > 0),
    });
  }
  const productBySku = new Map(products.map((p) => [p.seed.sku, p.id]));
  const comboRows = cfg.menu.flatMap((item) =>
    (item.combo ?? []).map(([sku, quantity]) => ({ restaurantId, comboId: productBySku.get(item.sku)!, productId: productBySku.get(sku)!, quantity })),
  );
  if (comboRows.length) await prisma.comboItem.createMany({ data: comboRows });
  // Mark a couple of items out of stock for realism.
  if (cfg.key === "spice") await db.product.update({ where: { restaurantId_sku: { restaurantId, sku: "ST-FAM" } }, data: { isAvailable: false } });
  console.log(`   · ${products.length} menu items, ${groups.size} modifier groups`);

  // Floors & tables
  const tables: { id: string; name: string; capacity: number }[] = [];
  for (const [fi, floor] of cfg.floors.entries()) {
    const f = await db.floor.create({ data: { restaurantId, name: floor.name, sortOrder: fi } });
    for (const [ti, [name, capacity, shape]] of floor.tables.entries()) {
      const t = await db.diningTable.create({ data: { restaurantId, floorId: f.id, name, capacity, shape, sortOrder: ti } });
      tables.push({ id: t.id, name: t.name, capacity: t.capacity });
    }
  }

  // Suppliers, ingredients, recipes
  const supplierIds = new Map<string, string>();
  for (const s of cfg.suppliers) {
    const row = await db.supplier.create({
      data: { restaurantId, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, paymentTerms: s.paymentTerms, gstNumber: s.gstNumber ?? null, address: s.address },
    });
    supplierIds.set(s.key, row.id);
  }
  const ingredients: { id: string; seed: IngredientSeed; supplierId: string | null }[] = [];
  for (const ing of cfg.ingredients) {
    const row = await db.ingredient.create({
      data: {
        restaurantId, name: ing.name, sku: ing.sku, category: ing.category, unit: ing.unit, currentStock: ing.stock, minStock: ing.min,
        maxStock: ing.max ?? null, costPerUnit: ing.cost * 100, supplierId: supplierIds.get(ing.supplier) ?? null,
        storageLocation: ing.storage, expiryDate: ing.expiresInDays != null ? dateOnly(-ing.expiresInDays) : null,
      },
    });
    ingredients.push({ id: row.id, seed: ing, supplierId: supplierIds.get(ing.supplier) ?? null });
  }
  const ingredientBySku = new Map(ingredients.map((i) => [i.seed.sku, i.id]));
  let recipeCount = 0;
  for (const item of cfg.menu) {
    if (!item.recipe?.length) continue;
    const lines = item.recipe.filter(([sku]) => ingredientBySku.has(sku));
    if (!lines.length) continue;
    await db.recipe.create({
      data: {
        restaurantId, productId: productBySku.get(item.sku)!, yieldQuantity: 1, wastePercent: 3, targetFoodCost: 30,
        prepTimeMinutes: item.prep ?? null,
        instructions: `1. Mise en place for ${item.name.toLowerCase()} as per station checklist.\n2. Cook to order; follow the plating guide on the station card.\n3. Check temperature and garnish before handing to the pass.`,
        ingredients: { create: lines.map(([sku, quantity, unit]) => ({ restaurantId, ingredientId: ingredientBySku.get(sku)!, quantity, unit, wastePercent: 0 })) },
      },
    });
    recipeCount++;
  }
  if (ingredients.length) console.log(`   · ${ingredients.length} ingredients, ${cfg.suppliers.length} suppliers, ${recipeCount} recipes`);

  // Customers
  const customerRows = CUSTOMER_NAMES.slice(0, cfg.customers).map((name, i) => {
    const hasBirthday = rnd.chance(0.55);
    return {
      id: seedId("cus"), restaurantId, name, phone: phoneFor(i + cfg.key.length * 100, cfg.key === "spice" ? "98" : cfg.key === "brew" ? "97" : "99"),
      email: rnd.chance(0.7) ? emailFor(name) : null,
      birthday: hasBirthday ? new Date(Date.UTC(1975 + rnd.int(0, 30), rnd.int(0, 11), rnd.int(1, 28), 12)) : null,
      tags: i < 8 ? ["VIP", "Regular"] : i < 20 ? ["Regular"] : rnd.chance(0.15) ? ["Corporate"] : [],
      // Regulars joined before the order history starts; everyone else joins along the way.
      createdAt: daysAgo(i < Math.ceil(cfg.customers * 0.35) ? rnd.int(cfg.history.days, cfg.history.days + 20) : rnd.int(5, cfg.history.days + 20)),
    };
  });
  // Today's birthday for the loyalty demo
  if (customerRows[3]) customerRows[3].birthday = new Date(Date.UTC(1992, new Date().getUTCMonth(), new Date().getUTCDate(), 12));
  await insertMany("customers", customerRows, (b) => prisma.customer.createMany({ data: b }));
  const addresses = customerRows.slice(0, Math.ceil(customerRows.length * 0.4)).map((c, i) => ({
    id: seedId("addr"), restaurantId, customerId: c.id, label: i % 3 === 0 ? "Work" : "Home",
    line1: `${rnd.int(1, 240)}, ${rnd.pick(["2nd Cross", "8th Main", "17th Cross", "1st Stage", "Lake View Road"])}`,
    landmark: rnd.pick(["Near Metro station", "Opp. City Park", "Behind Axis Bank", null]),
    city: cfg.profile.city ?? "Bengaluru", postalCode: cfg.profile.postalCode ?? null, isDefault: true,
  }));
  await prisma.customerAddress.createMany({ data: addresses });

  // Coupons & loyalty programme
  const coupons = cfg.extras.coupons
    ? [
        { code: "WELCOME10", description: "10% off your first order (max ₹100)", type: "PERCENT" as const, value: 10, maxDiscount: 10000, usageLimit: 500 },
        { code: "FLAT50", description: "₹50 off on orders above ₹500", type: "FLAT" as const, value: 5000, minOrder: 50000 },
        { code: "FESTIVE20", description: "Festive season — 20% off (max ₹250)", type: "PERCENT" as const, value: 20, maxDiscount: 25000, validFrom: dateOnly(7), validTo: dateOnly(-38) },
        { code: "MONSOON15", description: "Monsoon special (expired)", type: "PERCENT" as const, value: 15, maxDiscount: 15000, validFrom: dateOnly(100), validTo: dateOnly(40), isActive: true },
      ]
    : [];
  for (const c of coupons) await db.coupon.create({ data: { restaurantId, ...c } });

  const loyaltyEnabled = cfg.key !== "coastal";
  await db.loyaltyProgram.update({ where: { restaurantId }, data: { isEnabled: loyaltyEnabled } });

  // Order history
  const staffIds = (roles: string[]) => users.filter((u) => roles.includes(u.role)).map((u) => u.id);
  const { lastNumber, orderCount } = await generateOrderHistory(rnd, {
    restaurantId,
    days: cfg.history.days,
    baseDaily: cfg.history.baseDaily,
    typeMix: cfg.history.typeMix,
    serviceChargePercent: cfg.serviceChargePercent,
    taxRate: taxRate.rate,
    taxName: taxRate.name,
    pointsPerHundred: 10,
    pointValue: 25,
    products,
    customers: customerRows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, createdAt: c.createdAt })),
    tables,
    staff: { cashier: staffIds(["Cashier", "Manager", "Owner"]), floor: staffIds(["Waiter"]) },
    coupons: coupons.filter((c) => c.code !== "MONSOON15").map((c) => ({ code: c.code, type: c.type, value: c.value, maxAmount: c.maxDiscount, minOrder: c.minOrder })),
    orderPrefix: "ORD",
    startNumber: 1001,
    loyaltyEnabled,
  });
  await db.restaurantSettings.update({ where: { restaurantId }, data: { nextOrderNumber: lastNumber + 1 } });
  for (const c of coupons) {
    const used = await prisma.orderDiscount.count({ where: { restaurantId, couponCode: c.code } });
    await db.coupon.updateMany({ where: { code: c.code }, data: { usedCount: used } });
  }
  console.log(`   · ${orderCount.toLocaleString("en-IN")} historical orders (#1001–#${lastNumber})`);

  // Inventory ledger
  const owner = { id: created.owner.id, name: cfg.owner.name };
  if (ingredients.length) {
    const inventoryActor = users.find((u) => u.role === "Inventory Manager") ?? users[0]!;
    await seedInventoryLedger(rnd, restaurantId, ingredients, { id: inventoryActor.id, name: inventoryActor.name });
  }

  // Staff records
  const staffRows: { id: string; roleTitle: string }[] = [];
  const existingOwnerStaff = await db.staffMember.findFirst({ where: { restaurantUserId: created.membershipId } });
  if (existingOwnerStaff) {
    // The owner has been around since the restaurant opened, not since the seed ran.
    await db.staffMember.update({ where: { id: existingOwnerStaff.id }, data: { joiningDate: createdAt } });
    staffRows.push({ id: existingOwnerStaff.id, roleTitle: "Owner" });
  }
  let code = 2;
  for (const u of users.slice(1)) {
    const title = u.role === "Kitchen Staff" ? "Chef" : u.role;
    const s = await db.staffMember.create({
      data: {
        restaurantId, restaurantUserId: u.memberId, name: u.name, email: u.email, phone: u.phone, roleTitle: title,
        employeeCode: `EMP-${String(code++).padStart(3, "0")}`, joiningDate: dateOnly(rnd.int(30, cfg.createdDaysAgo)),
        salary: (title === "Manager" ? 55000 : title === "Accountant" ? 42000 : title === "Inventory Manager" ? 38000 : title === "Chef" ? 36000 : 22000) * 100,
      },
    });
    staffRows.push({ id: s.id, roleTitle: title });
  }
  if (cfg.extras.staff) {
    for (const s of STAFF_ONLY) {
      const row = await db.staffMember.create({
        data: {
          restaurantId, name: s.name, phone: s.phone, roleTitle: s.roleTitle, employeeCode: `EMP-${String(code++).padStart(3, "0")}`,
          joiningDate: dateOnly(rnd.int(40, cfg.createdDaysAgo)), salary: s.salary * 100,
          status: s.name === "Asha Kumari" ? "ON_LEAVE" : "ACTIVE", emergencyContact: `Family — ${phoneFor(code, "96")}`,
        },
      });
      staffRows.push({ id: row.id, roleTitle: s.roleTitle });
    }
    await seedStaffRecords(rnd, restaurantId, staffRows);
  }

  if (cfg.extras.expenses) await seedExpenses(rnd, restaurantId, cfg.extras.expenses, users.find((u) => u.role === "Accountant")?.id ?? owner.id);

  if (cfg.extras.reservations) {
    await seedReservations(rnd, restaurantId, customerRows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email })), tables, users[0]!.id);
  }

  if (cfg.extras.liveOrders) await seedLiveOrders(restaurantId, users, tables, products, customerRows);

  await seedAuditTrail(rnd, restaurantId, users.map((u) => ({ id: u.id, name: u.name, role: u.role })), AUDIT_SAMPLES);

  return { restaurantId, users };
}

/** Today's open service, created through the real order pipeline. */
async function seedLiveOrders(
  restaurantId: string,
  users: { id: string; name: string; role: string }[],
  tables: { id: string; name: string }[],
  products: SeededProduct[],
  customers: { id: string; name: string; phone: string }[],
) {
  const actorFor = (role: string): ServiceContext => {
    const u = users.find((x) => x.role === role) ?? users[0]!;
    return { restaurantId, db: tenantDb(restaurantId), actor: { userId: u.id, name: u.name, role: u.role }, permissions: "all" };
  };
  const p = (sku: string) => products.find((x) => x.seed.sku === sku)!;
  const t = (name: string) => tables.find((x) => x.name === name)!.id;
  const line = (sku: string, quantity = 1, variant?: number) => ({ productId: p(sku).id, quantity, variantId: variant != null ? p(sku).variants[variant]?.id ?? null : null, modifierIds: [] as string[] });

  const live: { table?: string; type: OrderType; items: ReturnType<typeof line>[]; status: "DRAFT" | "NEW" | "PREPARING" | "READY"; minutesAgo: number; guests?: number; customer?: number; role: string }[] = [
    { table: "T03", type: "DINE_IN", items: [line("MC-BTC"), line("MC-DLM"), line("BR-BNN", 4), line("BV-FLS", 2)], status: "NEW", minutesAgo: 9, guests: 3, role: "Waiter" },
    { table: "T05", type: "DINE_IN", items: [line("ST-PNT"), line("RB-CBR", 2, 0), line("SD-RTA", 2), line("BV-CCF", 2, 0)], status: "PREPARING", minutesAgo: 26, guests: 4, customer: 0, role: "Waiter" },
    { table: "T08", type: "DINE_IN", items: [line("MC-MPZ"), line("MC-CPA"), line("SD-GBR"), line("BV-LMN", 2)], status: "READY", minutesAgo: 41, guests: 2, role: "Waiter" },
    { table: "O2", type: "DINE_IN", items: [line("ST-TDC", 1, 1), line("MC-PBM"), line("BR-GNN", 3), line("BV-VMJ", 3)], status: "PREPARING", minutesAgo: 33, guests: 4, customer: 5, role: "Waiter" },
    { table: "P1", type: "DINE_IN", items: [line("ST-PNT", 2), line("ST-C65", 2), line("MC-BTC", 2), line("MC-MRJ"), line("RB-CBR", 1, 1), line("BR-BNN", 8), line("DS-GJM", 4)], status: "NEW", minutesAgo: 14, guests: 9, customer: 2, role: "Manager" },
    { table: "B2", type: "DINE_IN", items: [line("BV-VMJ", 2), line("SD-FRF")], status: "DRAFT", minutesAgo: 6, guests: 2, role: "Waiter" },
    { type: "TAKEAWAY", items: [line("CB-THL", 2), line("BV-MLS")], status: "PREPARING", minutesAgo: 12, customer: 7, role: "Cashier" },
    { type: "DELIVERY", items: [line("RB-CBR", 1, 1), line("SD-RTA"), line("DS-GJM", 2)], status: "NEW", minutesAgo: 4, customer: 11, role: "Cashier" },
  ];

  for (const o of live) {
    const ctx = actorFor(o.role);
    const order = await saveOrder(
      ctx,
      {
        type: o.type,
        tableId: o.table ? t(o.table) : null,
        guests: o.guests ?? null,
        customerId: o.customer != null ? customers[o.customer]!.id : null,
        deliveryAddress: o.type === "DELIVERY" ? "Flat 304, Sobha Daffodil, HSR Layout Sector 2, Bengaluru" : null,
        items: o.items,
      },
      o.status === "DRAFT" ? "DRAFT" : "KITCHEN",
    );
    if (o.status === "PREPARING" || o.status === "READY") await updateOrderStatus(ctx, order.id, "PREPARING");
    if (o.status === "READY") await updateOrderStatus(ctx, order.id, "READY");
    const placed = addMinutes(new Date(), -o.minutesAgo);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        createdAt: placed,
        placedAt: o.status === "DRAFT" ? null : placed,
        preparingAt: o.status === "PREPARING" || o.status === "READY" ? addMinutes(placed, 3) : null,
        readyAt: o.status === "READY" ? addMinutes(placed, 22) : null,
      },
    });
    await prisma.orderEvent.updateMany({ where: { orderId: order.id, type: "created" }, data: { createdAt: placed } });
    if (o.table) await prisma.diningTable.update({ where: { id: t(o.table) }, data: { occupiedSince: placed } });
  }

  // Three settled bills through the full checkout path (payment → stock deduction → loyalty).
  const cashier = actorFor("Cashier");
  for (const [items, method, customer] of [
    [[line("MC-CBG", 2), line("SD-FRF"), line("BV-CCF", 2, 0)], "UPI", 1],
    [[line("MC-MSD", 2), line("BV-MCH", 2)], "CASH", null],
    [[line("CB-BGM"), line("DS-CCK")], "CARD", 4],
  ] as const) {
    const draft = await saveOrder(cashier, { type: "TAKEAWAY", customerId: customer != null ? customers[customer]!.id : null, items: [...items] }, "DRAFT");
    await checkout(cashier, {
      orderId: draft.id,
      type: "TAKEAWAY",
      customerId: customer != null ? customers[customer]!.id : null,
      items: [...items],
      payments: [{ method, amount: draft.total, receivedAmount: method === "CASH" ? Math.ceil(draft.total / 50000) * 50000 : null, reference: method === "UPI" ? "UPI428817352" : method === "CARD" ? "XXXX4417" : null }],
    });
  }

  // Table states that aren't driven by orders.
  await prisma.diningTable.updateMany({ where: { restaurantId, name: "T10" }, data: { status: "RESERVED" } });
  await prisma.diningTable.updateMany({ where: { restaurantId, name: "T11" }, data: { status: "CLEANING" } });
  await prisma.diningTable.updateMany({ where: { restaurantId, name: "O6" }, data: { status: "BLOCKED", notes: "Umbrella broken — awaiting repair" } });
  console.log("   · live service: 8 open orders, 3 settled bills via checkout");
}

const AUDIT_SAMPLES = [
  { action: "product.updated", entity: "Product", summary: (a: string) => `${a} updated the price of Paneer Tikka to ₹329`, roles: ["Owner", "Manager"] },
  { action: "inventory.adjusted", entity: "Ingredient", summary: (a: string) => `${a} adjusted Onion stock by −1.5 kg (stock count)`, roles: ["Inventory Manager", "Manager"] },
  { action: "order.discount", entity: "Order", summary: (a: string) => `${a} applied a 10% discount on a dine-in bill`, roles: ["Cashier", "Manager"] },
  { action: "order.cancelled", entity: "Order", summary: (a: string) => `${a} cancelled an order — guest left before service`, roles: ["Manager", "Cashier"] },
  { action: "payment.received", entity: "Order", summary: (a: string) => `${a} processed a split payment (UPI + Cash)`, roles: ["Cashier"] },
  { action: "menu.availability", entity: "Product", summary: (a: string) => `${a} marked Fish Amritsari as out of stock`, roles: ["Manager", "Kitchen Staff"] },
  { action: "purchase.received", entity: "Purchase", summary: (a: string) => `${a} received a purchase from Kaveri Dairy Co.`, roles: ["Inventory Manager"] },
  { action: "expense.created", entity: "Expense", summary: (a: string) => `${a} recorded an expense: Commercial LPG cylinders`, roles: ["Accountant"] },
  { action: "settings.updated", entity: "Settings", summary: (a: string) => `${a} updated receipt footer text`, roles: ["Owner"] },
  { action: "reservation.created", entity: "Reservation", summary: (a: string) => `${a} booked a table for 6 guests`, roles: ["Manager", "Cashier", "Waiter"] },
];

// ─── Platform ───────────────────────────────────────────────────────────────

async function seedLightTenants() {
  const light = [
    { name: "Urban Tadka", city: "New Delhi", state: "Delhi", owner: "Simran Kaur", email: "owner@urbantadka.demo", plan: "starter", daysAgo: 162, status: "SUSPENDED" as const },
    { name: "Bombay Bites", city: "Mumbai", state: "Maharashtra", owner: "Kunal Khanna", email: "owner@bombaybites.demo", plan: "professional", daysAgo: 3, status: "ACTIVE" as const },
  ];
  for (const l of light) {
    const { restaurant, owner } = await createRestaurantTenant({
      profile: { name: l.name, ownerName: l.owner, email: l.email.replace("owner@", "hello@"), phone: phoneFor(l.daysAgo, "93"), city: l.city, state: l.state, country: "India", restaurantType: "Casual Dining" },
      config: { numberOfTables: 8 },
      owner: { name: l.owner, email: l.email, password: DEMO_PASSWORD },
      planKey: l.plan,
    });
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        createdAt: daysAgo(l.daysAgo),
        status: l.status,
        lastActiveAt: daysAgo(l.status === "SUSPENDED" ? 21 : 0),
        ...(l.status === "SUSPENDED" ? { suspendedAt: daysAgo(19), suspendReason: "Subscription payment overdue by 30 days" } : {}),
      },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { createdAt: daysAgo(l.daysAgo) } });
    await prisma.subscription.update({
      where: { restaurantId: restaurant.id },
      data: l.status === "SUSPENDED"
        ? { status: "PAST_DUE", currentPeriodStart: daysAgo(49), currentPeriodEnd: daysAgo(19), trialEndsAt: null }
        : { status: "TRIALING" },
    });
    console.log(`\n▸ ${l.name} (${l.status === "SUSPENDED" ? "suspended" : "trial"})`);
  }
}

async function seedPlatformAudit(adminId: string, restaurants: { id: string; name: string; createdAt: Date }[]) {
  const rows = restaurants.flatMap((r) => [
    { id: seedId("pal"), scope: "PLATFORM" as const, restaurantId: r.id, userId: adminId, actorName: "Platform Admin", actorRole: "Super Admin", action: "restaurant.created", entity: "Restaurant", entityId: r.id, summary: `Restaurant ${r.name} created`, createdAt: r.createdAt },
  ]);
  const spice = restaurants.find((r) => r.name === "Spice & Stone");
  const tadka = restaurants.find((r) => r.name === "Urban Tadka");
  if (spice) rows.push({ id: seedId("pal"), scope: "PLATFORM", restaurantId: spice.id, userId: adminId, actorName: "Platform Admin", actorRole: "Super Admin", action: "subscription.changed", entity: "Subscription", entityId: spice.id, summary: "Spice & Stone upgraded from Professional to Enterprise", createdAt: daysAgo(41) });
  if (tadka) rows.push({ id: seedId("pal"), scope: "PLATFORM", restaurantId: tadka.id, userId: adminId, actorName: "Platform Admin", actorRole: "Super Admin", action: "restaurant.suspended", entity: "Restaurant", entityId: tadka.id, summary: "Urban Tadka suspended — subscription payment overdue by 30 days", createdAt: daysAgo(19) });
  await prisma.auditLog.createMany({ data: rows });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  if (await prisma.user.findFirst({ where: { platformRole: "SUPER_ADMIN" } })) {
    console.log("Database already contains data. Run `npm run db:reset` to reseed from scratch.");
    return;
  }

  console.log("Seeding Tabla demo data …");
  await syncPermissionCatalog();
  await seedPlans();
  await prisma.platformSetting.createMany({
    data: [
      { key: "platformName", value: "Tabla" },
      { key: "supportEmail", value: "support@tabla.dev" },
      { key: "supportPhone", value: "+91 80 4718 2200" },
      { key: "defaultPlanKey", value: "starter" },
      { key: "allowSelfSignup", value: true },
      { key: "maintenanceBanner", value: "" },
    ],
  });

  const admin = await prisma.user.create({
    data: { email: "admin@tabla.dev", name: "Platform Admin", passwordHash: await hashPassword(ADMIN_PASSWORD), platformRole: "SUPER_ADMIN", createdAt: daysAgo(400) },
  });

  for (const r of RESTAURANTS) await seedRestaurant(r);
  await seedLightTenants();

  const all = await prisma.restaurant.findMany({ select: { id: true, name: true, createdAt: true } });
  await seedPlatformAudit(admin.id, all);

  console.log(`\n✔ Seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  console.log("  DEMO CREDENTIALS (development only)");
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(`  Super Admin   /super-admin/login   admin@tabla.dev            ${ADMIN_PASSWORD}`);
  console.log(`  Owner         /auth/login          owner@spiceandstone.demo   ${DEMO_PASSWORD}`);
  console.log(`  Manager       (2 restaurants)      manager@spiceandstone.demo ${DEMO_PASSWORD}`);
  console.log(`  Cashier                            cashier@spiceandstone.demo ${DEMO_PASSWORD}`);
  console.log(`  Waiter / Kitchen / Accounts / Inventory: waiter@ · kitchen@ · accounts@ · inventory@spiceandstone.demo`);
  console.log(`  Café owner                         owner@brewroom.demo        ${DEMO_PASSWORD}`);
  console.log(`  Starter plan                       owner@coastalcurry.demo    ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

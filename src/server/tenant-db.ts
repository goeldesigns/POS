import { prisma } from "./db";

/**
 * Models that carry `restaurantId`. Every query against these models through a
 * tenant client is forced into the tenant: filters get `restaurantId` added and
 * creates get it stamped, so a forgotten `where` can never leak another
 * restaurant's rows.
 *
 * Join tables without `restaurantId` (RolePermission, ProductModifierGroup)
 * are only touched after their tenant-owned parent has been verified.
 */
export const TENANT_MODELS = new Set<string>([
  "Role",
  "RestaurantUser",
  "UserPermission",
  "RestaurantModule",
  "ApiKey",
  "RestaurantSettings",
  "Subscription",
  "TaxRate",
  "Category",
  "Product",
  "ProductVariant",
  "ModifierGroup",
  "Modifier",
  "ComboItem",
  "Floor",
  "DiningTable",
  "Reservation",
  "Customer",
  "CustomerAddress",
  "CustomerNote",
  "Coupon",
  "Order",
  "OrderItem",
  "OrderPayment",
  "OrderDiscount",
  "OrderTax",
  "OrderEvent",
  "Expense",
  "StaffMember",
  "Attendance",
  "Shift",
  "Supplier",
  "Ingredient",
  "Recipe",
  "RecipeIngredient",
  "Purchase",
  "PurchaseItem",
  "StockTransaction",
  "Waste",
  "LoyaltyProgram",
  "LoyaltyAccount",
  "LoyaltyTransaction",
  "Integration",
  "IntegrationCredential",
  "ExternalOrder",
  "AuditLog",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

function scopeArgs(operation: string, args: AnyArgs | undefined, restaurantId: string): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };
  if (WHERE_OPERATIONS.has(operation)) {
    a.where = { ...(a.where ?? {}), restaurantId };
  } else if (operation === "create") {
    a.data = { ...(a.data as Record<string, unknown>), restaurantId };
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    a.data = Array.isArray(a.data)
      ? a.data.map((d: Record<string, unknown>) => ({ ...d, restaurantId }))
      : { ...(a.data as Record<string, unknown>), restaurantId };
  } else if (operation === "upsert") {
    a.where = { ...(a.where ?? {}), restaurantId };
    a.create = { ...(a.create ?? {}), restaurantId };
  }
  return a;
}

function createTenantClient(restaurantId: string) {
  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(operation, args as AnyArgs, restaurantId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;
/** Client available inside `$transaction(async (tx) => …)`; TenantDb is assignable to it. */
export type TenantTx = Omit<TenantDb, "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;

const cache = new Map<string, TenantDb>();
const MAX_CACHED = 200;

/** Tenant-scoped Prisma client for one restaurant. */
export function tenantDb(restaurantId: string): TenantDb {
  if (!restaurantId) throw new Error("tenantDb requires a restaurantId");
  let client = cache.get(restaurantId);
  if (!client) {
    client = createTenantClient(restaurantId);
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(restaurantId, client);
  }
  return client;
}

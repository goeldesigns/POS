/**
 * Single source of truth for modules and their permission actions.
 *
 * - Module keys double as plan feature keys and RestaurantModule keys.
 * - Permission keys are `${module}.${action}` (e.g. `orders.create`).
 * - `column` places the action in the permission-matrix UI.
 */

export type PermissionColumn = "view" | "create" | "edit" | "delete" | "extra";

interface ActionDef {
  readonly label: string;
  readonly column: PermissionColumn;
  readonly description?: string;
}

interface ModuleDef {
  readonly label: string;
  readonly description: string;
  /** Core modules are always enabled and cannot be switched off. */
  readonly core?: boolean;
  readonly group: "Operations" | "Catalogue" | "People" | "Back office" | "Growth" | "System";
  readonly actions: Readonly<Record<string, ActionDef>>;
}

const view = { label: "View", column: "view" } as const;
const create = { label: "Create", column: "create" } as const;
const edit = { label: "Edit", column: "edit" } as const;
const remove = { label: "Delete", column: "delete" } as const;

export const MODULE_CATALOG = {
  overview: {
    label: "Overview",
    description: "Dashboard with sales, orders and alerts",
    core: true,
    group: "Operations",
    actions: { view },
  },
  pos: {
    label: "POS",
    description: "Billing counter, order taking and payments",
    group: "Operations",
    actions: {
      view,
      create_order: { label: "Create order", column: "create" },
      edit_order: { label: "Edit order", column: "edit" },
      void_order: { label: "Void order", column: "delete" },
      apply_discount: { label: "Apply discount", column: "extra" },
      process_payment: { label: "Process payment", column: "extra" },
      refund: { label: "Refund", column: "extra" },
    },
  },
  orders: {
    label: "Orders",
    description: "Order history, kitchen status and refunds",
    group: "Operations",
    actions: {
      view,
      create,
      edit,
      cancel: { label: "Cancel", column: "delete" },
      refund: { label: "Refund", column: "extra" },
    },
  },
  tables: {
    label: "Tables",
    description: "Floor plan, table status and order assignment",
    group: "Operations",
    actions: {
      view,
      create,
      edit,
      delete: remove,
      assign_orders: { label: "Assign orders", column: "extra" },
    },
  },
  reservations: {
    label: "Reservations",
    description: "Bookings, check-ins and table allocation",
    group: "Operations",
    actions: {
      view,
      create,
      edit,
      cancel: { label: "Cancel", column: "delete" },
    },
  },
  menu: {
    label: "Menu",
    description: "Products, categories, modifiers and combos",
    group: "Catalogue",
    actions: { view, create, edit, delete: remove },
  },
  recipes: {
    label: "Recipe",
    description: "Recipe costing and ingredient mapping",
    group: "Catalogue",
    actions: { view, create, edit, delete: remove },
  },
  inventory: {
    label: "Inventory",
    description: "Ingredients, stock, purchases and suppliers",
    group: "Catalogue",
    actions: {
      view,
      create: { label: "Create items", column: "create" },
      edit,
      delete: remove,
      add_stock: { label: "Add stock", column: "extra" },
      adjust_stock: { label: "Adjust stock", column: "extra" },
      transfer_stock: { label: "Transfer stock", column: "extra" },
    },
  },
  customers: {
    label: "Customers",
    description: "Customer profiles, history and notes",
    group: "People",
    actions: { view, create, edit, delete: remove },
  },
  staff: {
    label: "Staff",
    description: "Employees, attendance and shifts",
    group: "People",
    actions: { view, create, edit, delete: remove },
  },
  reports: {
    label: "Reports",
    description: "Sales, tax, inventory and P&L reports",
    group: "Back office",
    actions: {
      view,
      export: { label: "Export", column: "extra" },
    },
  },
  expenses: {
    label: "Expenses",
    description: "Operating expenses and vendor payments",
    group: "Back office",
    actions: { view, create, edit, delete: remove },
  },
  loyalty: {
    label: "Loyalty",
    description: "Points programme and customer rewards",
    group: "Growth",
    actions: {
      view,
      manage: { label: "Manage", column: "edit" },
    },
  },
  swiggy: {
    label: "Swiggy",
    description: "Swiggy aggregator connection",
    group: "Growth",
    actions: {
      view,
      manage: { label: "Manage", column: "edit" },
    },
  },
  zomato: {
    label: "Zomato",
    description: "Zomato aggregator connection",
    group: "Growth",
    actions: {
      view,
      manage: { label: "Manage", column: "edit" },
    },
  },
  settings: {
    label: "Settings",
    description: "Restaurant configuration, users and roles",
    core: true,
    group: "System",
    actions: { view, edit },
  },
} as const satisfies Record<string, ModuleDef>;

export type ModuleKey = keyof typeof MODULE_CATALOG;

export type PermissionKey = {
  [M in ModuleKey]: `${M}.${Extract<keyof (typeof MODULE_CATALOG)[M]["actions"], string>}`;
}[ModuleKey];

export const MODULE_KEYS = Object.keys(MODULE_CATALOG) as ModuleKey[];

export const CORE_MODULES = MODULE_KEYS.filter(
  (key) => (MODULE_CATALOG[key] as ModuleDef).core === true,
);

export interface PermissionDefinition {
  key: PermissionKey;
  module: ModuleKey;
  action: string;
  label: string;
  column: PermissionColumn;
  sortOrder: number;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = MODULE_KEYS.flatMap((module, moduleIndex) =>
  Object.entries(MODULE_CATALOG[module].actions as Record<string, ActionDef>).map(
    ([action, def], actionIndex) => ({
      key: `${module}.${action}` as PermissionKey,
      module,
      action,
      label: def.label,
      column: def.column,
      sortOrder: moduleIndex * 100 + actionIndex,
    }),
  ),
);

export const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

export function isModuleKey(value: string): value is ModuleKey {
  return value in MODULE_CATALOG;
}

export function moduleOf(key: PermissionKey): ModuleKey {
  return key.split(".")[0] as ModuleKey;
}

export function permissionsForModule(module: ModuleKey): PermissionDefinition[] {
  return ALL_PERMISSIONS.filter((p) => p.module === module);
}

export function moduleLabel(module: ModuleKey): string {
  return MODULE_CATALOG[module].label;
}

/** Plan-only feature flags that are not modules. */
export const PLAN_FLAGS = {
  advanced_analytics: "Advanced analytics",
  multi_location: "Multi-location",
  api_access: "Public API access",
  custom_roles: "Custom roles",
} as const;

export type PlanFlag = keyof typeof PLAN_FLAGS;

import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalog";

export interface SystemRoleTemplate {
  name: string;
  description: string;
  isOwner?: boolean;
  permissions: readonly PermissionKey[];
}

const allExcept = (excluded: readonly PermissionKey[]) =>
  ALL_PERMISSION_KEYS.filter((key) => !excluded.includes(key));

/** Roles created for every new restaurant. Editable afterwards (except Owner). */
export const SYSTEM_ROLES: readonly SystemRoleTemplate[] = [
  {
    name: "Owner",
    description: "Full access to every enabled module",
    isOwner: true,
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    name: "Manager",
    description: "Runs daily operations; cannot change billing or delete staff",
    permissions: allExcept(["staff.delete", "settings.edit", "swiggy.manage", "zomato.manage"]),
  },
  {
    name: "Cashier",
    description: "Billing counter: orders, payments and customers",
    permissions: [
      "overview.view",
      "pos.view",
      "pos.create_order",
      "pos.edit_order",
      "pos.apply_discount",
      "pos.process_payment",
      "orders.view",
      "orders.create",
      "orders.edit",
      "tables.view",
      "tables.assign_orders",
      "reservations.view",
      "reservations.create",
      "reservations.edit",
      "menu.view",
      "customers.view",
      "customers.create",
      "customers.edit",
      "loyalty.view",
    ],
  },
  {
    name: "Waiter",
    description: "Takes dine-in orders and manages tables",
    permissions: [
      "pos.view",
      "pos.create_order",
      "pos.edit_order",
      "orders.view",
      "orders.create",
      "tables.view",
      "tables.assign_orders",
      "reservations.view",
      "reservations.create",
      "menu.view",
      "customers.view",
      "customers.create",
    ],
  },
  {
    name: "Kitchen Staff",
    description: "Sees incoming orders and updates preparation status",
    permissions: ["orders.view", "orders.edit", "menu.view", "recipes.view", "inventory.view"],
  },
  {
    name: "Accountant",
    description: "Reports, expenses and financial review",
    permissions: [
      "overview.view",
      "orders.view",
      "customers.view",
      "reports.view",
      "reports.export",
      "expenses.view",
      "expenses.create",
      "expenses.edit",
      "expenses.delete",
      "inventory.view",
    ],
  },
  {
    name: "Inventory Manager",
    description: "Stock, purchases, suppliers and recipes",
    permissions: [
      "overview.view",
      "menu.view",
      "recipes.view",
      "recipes.create",
      "recipes.edit",
      "recipes.delete",
      "inventory.view",
      "inventory.create",
      "inventory.edit",
      "inventory.delete",
      "inventory.add_stock",
      "inventory.adjust_stock",
      "inventory.transfer_stock",
      "reports.view",
      "expenses.view",
      "expenses.create",
    ],
  },
];

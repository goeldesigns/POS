import { canAny, type PermissionSubject } from "./permissions/can";
import type { PermissionKey } from "./permissions/catalog";

export type NavIcon =
  | "overview" | "pos" | "orders" | "tables" | "reservations" | "menu" | "customers" | "reports" | "expenses"
  | "staff" | "recipes" | "inventory" | "integrations" | "loyalty" | "settings"
  | "dashboard" | "restaurants" | "demos" | "users" | "plans" | "analytics" | "audit";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Any-of. Omitted → visible to every signed-in user. */
  permission?: PermissionKey | readonly PermissionKey[];
  shortcut?: string;
  /** Count shown next to the label (e.g. new demo requests). */
  badge?: number;
}

/** Restaurant sidebar. Rendered items are filtered by the user's effective permissions. */
export const RESTAURANT_NAV: NavItem[] = [
  { label: "Overview", href: "/app/overview", icon: "overview", permission: "overview.view" },
  { label: "POS", href: "/app/pos", icon: "pos", permission: "pos.view", shortcut: "F2" },
  { label: "Orders", href: "/app/orders", icon: "orders", permission: "orders.view" },
  { label: "Tables", href: "/app/tables", icon: "tables", permission: "tables.view" },
  { label: "Reservations", href: "/app/reservations", icon: "reservations", permission: "reservations.view" },
  { label: "Menu", href: "/app/menu", icon: "menu", permission: "menu.view" },
  { label: "Customers", href: "/app/customers", icon: "customers", permission: "customers.view" },
  { label: "Reports", href: "/app/reports", icon: "reports", permission: "reports.view" },
  { label: "Expenses", href: "/app/expenses", icon: "expenses", permission: "expenses.view" },
  { label: "Staff", href: "/app/staff", icon: "staff", permission: "staff.view" },
  { label: "Recipes", href: "/app/recipes", icon: "recipes", permission: "recipes.view" },
  { label: "Inventory", href: "/app/inventory", icon: "inventory", permission: "inventory.view" },
  { label: "Swiggy & Zomato", href: "/app/integrations", icon: "integrations", permission: ["swiggy.view", "zomato.view"] },
  { label: "Loyalty Points", href: "/app/loyalty", icon: "loyalty", permission: "loyalty.view" },
  { label: "Settings", href: "/app/settings", icon: "settings" },
];

export const SUPER_ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/super-admin/dashboard", icon: "dashboard" },
  { label: "Restaurants", href: "/super-admin/restaurants", icon: "restaurants" },
  { label: "Demo requests", href: "/super-admin/demos", icon: "demos" },
  { label: "Users", href: "/super-admin/users", icon: "users" },
  { label: "Plans", href: "/super-admin/plans", icon: "plans" },
  { label: "Analytics", href: "/super-admin/analytics", icon: "analytics" },
  { label: "Audit Logs", href: "/super-admin/audit-logs", icon: "audit" },
  { label: "Settings", href: "/super-admin/settings", icon: "settings" },
];

export function navFor(subject: PermissionSubject, items: NavItem[] = RESTAURANT_NAV): NavItem[] {
  return items.filter((item) => {
    if (!item.permission) return true;
    const keys = (Array.isArray(item.permission) ? item.permission : [item.permission]) as PermissionKey[];
    return canAny(subject, keys);
  });
}

/** Where to send a user after login: their first permitted module. */
export function homeFor(subject: PermissionSubject): string {
  const first = navFor(subject).find((i) => i.permission);
  // Kitchen-only roles work from the ticket board, not the order list.
  if (first?.href === "/app/orders" && isKitchenOnly(subject)) return "/app/orders?view=board";
  return first?.href ?? "/app/settings";
}

/** Roles that cook but neither take orders nor payments: they see the kitchen board, never prices. */
export function isKitchenOnly(subject: PermissionSubject): boolean {
  return !canAny(subject, ["pos.create_order", "orders.create", "pos.process_payment"] as PermissionKey[]);
}

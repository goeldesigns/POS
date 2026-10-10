import type { PermissionKey } from "@/lib/permissions/catalog";
import { ForbiddenError } from "../errors";
import type { ServiceContext } from "./load-context";

/** Service-level assertion; trusted system contexts pass automatically. */
export function assertPermission(ctx: ServiceContext, key: PermissionKey, message?: string) {
  if (ctx.permissions === "all") return;
  if (!ctx.permissions.has(key)) throw new ForbiddenError(message);
}

/** Any-of variant. */
export function assertAnyPermission(ctx: ServiceContext, keys: readonly PermissionKey[], message?: string) {
  if (ctx.permissions === "all") return;
  const held = ctx.permissions;
  if (!keys.some((k) => held.has(k))) throw new ForbiddenError(message);
}

export function hasPermission(ctx: ServiceContext, key: PermissionKey): boolean {
  return ctx.permissions === "all" || ctx.permissions.has(key);
}

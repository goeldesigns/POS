import { redirect } from "next/navigation";
import { can } from "@/lib/permissions/can";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { getPlatformContext, getRestaurantContext, type PlatformContext, type RestaurantContext } from "./context";

export { assertPermission, assertAnyPermission, hasPermission } from "./guards-core";

/** Page guard: signed-in restaurant user (any permission). */
export async function requireRestaurantSession(): Promise<RestaurantContext> {
  const ctx = await getRestaurantContext();
  if (!ctx) redirect("/auth/login");
  return ctx;
}

/**
 * Page guard for module pages. Missing permission (or a module the platform
 * has switched off) sends the user to an explanatory no-access page — the
 * page body never renders and no data is queried.
 */
export async function requirePagePermission(
  required: PermissionKey | readonly PermissionKey[],
): Promise<RestaurantContext> {
  const ctx = await requireRestaurantSession();
  const keys = (Array.isArray(required) ? required : [required]) as PermissionKey[];
  if (!keys.some((k) => can(ctx, k))) {
    redirect(`/app/no-access?required=${encodeURIComponent(keys[0]!)}`);
  }
  return ctx;
}

export async function requirePlatformSession(): Promise<PlatformContext> {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/super-admin/login");
  return ctx;
}

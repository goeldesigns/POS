import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  loadPlatformContext,
  loadRestaurantContext,
  type PlatformContext,
  type RestaurantContext,
} from "./load-context";
import { SESSION_COOKIE, type RequestMeta } from "./session";

export * from "./load-context";

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

/** Per-request memoised restaurant context (cookie based). */
export const getRestaurantContext = cache(async (): Promise<RestaurantContext | null> => {
  const store = await cookies();
  return loadRestaurantContext(store.get(SESSION_COOKIE.RESTAURANT)?.value, await getRequestMeta());
});

/** Per-request memoised platform (Super Admin) context. */
export const getPlatformContext = cache(async (): Promise<PlatformContext | null> => {
  const store = await cookies();
  return loadPlatformContext(store.get(SESSION_COOKIE.PLATFORM)?.value, await getRequestMeta());
});

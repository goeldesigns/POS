import { canAny } from "@/lib/permissions/can";
import { CORE_MODULES, isModuleKey, type PermissionKey } from "@/lib/permissions/catalog";
import { prisma } from "../db";
import { hashToken } from "../crypto";
import { tenantDb } from "../tenant-db";
import { loadRestaurantContext, type ServiceContext } from "../auth/load-context";
import { SESSION_COOKIE, type RequestMeta } from "../auth/session";
import { AppError, ForbiddenError, toAppError, UnauthorizedError } from "../errors";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";

/**
 * Consistent JSON envelope for every API route:
 *   200 { data }        4xx/5xx { error: { code, message, fieldErrors? } }
 */
export function json(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown) {
  const e = toAppError(error);
  return Response.json(
    { error: { code: e.code, message: e.message, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) } },
    { status: e.status, headers: { "Cache-Control": "no-store" } },
  );
}

export interface ApiContext extends ServiceContext {
  kind: "restaurant" | "apiKey";
  permissions: ReadonlySet<PermissionKey>;
  restaurant: { id: string; name: string; currency: string; timezone: string };
}

/** API-key scopes → permissions (intersected with the tenant's modules). */
const SCOPE_PERMISSIONS: Record<string, PermissionKey[]> = {
  "menu:read": ["menu.view"],
  "orders:read": ["orders.view"],
  "orders:write": ["orders.view", "orders.create", "pos.create_order"],
  "customers:write": ["customers.view", "customers.create"],
};

function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  };
}

async function apiKeyContext(rawKey: string, meta: RequestMeta): Promise<ApiContext | null> {
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(rawKey) },
    include: {
      restaurant: {
        include: {
          modules: { where: { enabled: true } },
          subscription: { include: { plan: { include: { features: true } } } },
        },
      },
    },
  });
  if (!key || key.revokedAt || key.restaurant.status !== "ACTIVE" || key.restaurant.deletedAt) return null;
  const hasApiAccess = key.restaurant.subscription?.plan.features.some((f) => f.featureKey === "api_access" && f.enabled);
  if (!hasApiAccess) return null;

  const modules = new Set<string>([...CORE_MODULES, ...key.restaurant.modules.map((m) => m.moduleKey).filter(isModuleKey)]);
  const permissions = new Set<PermissionKey>();
  for (const scope of key.scopes) {
    for (const p of SCOPE_PERMISSIONS[scope] ?? []) if (modules.has(p.split(".")[0]!)) permissions.add(p);
  }
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  const r = key.restaurant;
  return {
    kind: "apiKey",
    restaurantId: r.id,
    db: tenantDb(r.id),
    actor: { userId: null, name: `API key “${key.name}”`, role: "API" },
    permissions,
    meta,
    restaurant: { id: r.id, name: r.name, currency: r.currency, timezone: r.timezone },
  };
}

/** Resolve the caller from a Bearer API key or the restaurant session cookie. */
export async function resolveApiContext(req: Request): Promise<ApiContext | null> {
  const meta = requestMeta(req);
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return apiKeyContext(auth.slice(7).trim(), meta);

  const ctx = await loadRestaurantContext(readCookie(req, SESSION_COOKIE.RESTAURANT), meta);
  if (!ctx) return null;
  return { ...ctx, kind: "restaurant" };
}

/** Cookie-authenticated writes must come from our own origin (CSRF defence). */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    if (new URL(origin).host !== host) throw new ForbiddenError("Cross-site request blocked");
    return;
  }
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") {
    throw new ForbiddenError("Cross-site request blocked");
  }
}

type RouteParams = Record<string, string | string[]>;

/**
 * Wrap a tenant API route: authentication (cookie or API key), tenant scoping,
 * permission check (any-of), CSRF check for cookie writes, rate limiting for
 * API keys, and the standard error envelope.
 */
export function tenantRoute<P extends RouteParams = RouteParams>(
  config: { permission?: PermissionKey | readonly PermissionKey[] },
  handler: (req: Request, ctx: ApiContext, params: P) => Promise<unknown>,
) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const ctx = await resolveApiContext(req);
      if (!ctx) throw new UnauthorizedError("Authentication required");
      if (ctx.kind === "restaurant" && req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      if (ctx.kind === "apiKey") await enforceRateLimit(`api:${ctx.restaurantId}`, RATE_LIMITS.publicApi);
      if (config.permission) {
        const keys = (Array.isArray(config.permission) ? config.permission : [config.permission]) as PermissionKey[];
        if (!canAny(ctx, keys)) throw new ForbiddenError();
      }
      const result = await handler(req, ctx, await route.params);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON", { status: 400, code: "invalid_json" });
  }
}

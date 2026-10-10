import type { RestaurantStatus } from "@/generated/prisma/enums";
import { computeEffectivePermissions } from "@/lib/permissions/can";
import { CORE_MODULES, isModuleKey, type ModuleKey, type PermissionKey } from "@/lib/permissions/catalog";
import { prisma } from "../db";
import { tenantDb, type TenantDb } from "../tenant-db";
import { findSession, type RequestMeta } from "./session";

export interface Actor {
  userId: string | null;
  name: string;
  role?: string | null;
}

/**
 * Minimal context every tenant service needs. `permissions: "all"` is used for
 * trusted system flows (aggregator webhooks, seed, background jobs).
 */
export interface ServiceContext {
  restaurantId: string;
  db: TenantDb;
  actor: Actor;
  permissions: ReadonlySet<string> | "all";
  meta?: RequestMeta;
}

export interface RestaurantContext extends ServiceContext {
  kind: "restaurant";
  sessionId: string;
  permissions: ReadonlySet<PermissionKey>;
  user: { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    currency: string;
    timezone: string;
    locale: string;
    status: RestaurantStatus;
    logoUrl: string | null;
  };
  membership: { id: string; roleId: string; roleName: string; isOwner: boolean };
  modules: ReadonlySet<ModuleKey>;
  plan: { key: string; name: string; flags: ReadonlySet<string> } | null;
}

export interface PlatformContext {
  kind: "platform";
  sessionId: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null; platformRole: string };
  actor: Actor;
  meta?: RequestMeta;
}

export async function loadRestaurantContext(
  token: string | undefined | null,
  meta?: RequestMeta,
): Promise<RestaurantContext | null> {
  const session = await findSession(token, "RESTAURANT");
  if (!session?.restaurantId) return null;

  const membership = await prisma.restaurantUser.findUnique({
    where: { restaurantId_userId: { restaurantId: session.restaurantId, userId: session.userId } },
    include: {
      role: { include: { permissions: { select: { permissionKey: true } } } },
      permissions: { select: { permissionKey: true, effect: true } },
      restaurant: {
        include: {
          modules: { where: { enabled: true }, select: { moduleKey: true } },
          subscription: { include: { plan: { include: { features: true } } } },
        },
      },
    },
  });
  if (!membership || membership.status !== "ACTIVE") return null;

  const r = membership.restaurant;
  if (r.status === "ARCHIVED" || r.deletedAt) return null;

  const enabledModules = new Set<ModuleKey>(CORE_MODULES);
  for (const m of r.modules) if (isModuleKey(m.moduleKey)) enabledModules.add(m.moduleKey);

  const permissions =
    r.status === "SUSPENDED"
      ? new Set<PermissionKey>()
      : computeEffectivePermissions({
          isOwner: membership.role.isOwner,
          rolePermissions: membership.role.permissions.map((p) => p.permissionKey),
          overrides: membership.permissions,
          enabledModules: [...enabledModules],
        });

  const plan = r.subscription?.plan;

  return {
    kind: "restaurant",
    sessionId: session.id,
    restaurantId: r.id,
    db: tenantDb(r.id),
    actor: { userId: session.user.id, name: session.user.name, role: membership.role.name },
    permissions,
    meta,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
      avatarUrl: session.user.avatarUrl,
    },
    restaurant: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      currency: r.currency,
      timezone: r.timezone,
      locale: r.locale,
      status: r.status,
      logoUrl: r.logoUrl,
    },
    membership: {
      id: membership.id,
      roleId: membership.roleId,
      roleName: membership.role.name,
      isOwner: membership.role.isOwner,
    },
    modules: enabledModules,
    plan: plan
      ? {
          key: plan.key,
          name: plan.name,
          flags: new Set(plan.features.filter((f) => f.enabled).map((f) => f.featureKey)),
        }
      : null,
  };
}

export async function loadPlatformContext(
  token: string | undefined | null,
  meta?: RequestMeta,
): Promise<PlatformContext | null> {
  const session = await findSession(token, "PLATFORM");
  if (!session || !session.user.platformRole) return null;
  return {
    kind: "platform",
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatarUrl: session.user.avatarUrl,
      platformRole: session.user.platformRole,
    },
    actor: { userId: session.user.id, name: session.user.name, role: "Super Admin" },
    meta,
  };
}

/** System context for trusted background flows (webhooks, jobs, seed). */
export function systemContext(restaurantId: string, actorName = "System"): ServiceContext {
  return {
    restaurantId,
    db: tenantDb(restaurantId),
    actor: { userId: null, name: actorName, role: "System" },
    permissions: "all",
  };
}

import type { RestaurantStatus } from "@/generated/prisma/enums";
import type { ModuleKey, PermissionKey } from "@/lib/permissions/catalog";
import { AppError } from "../errors";
import { backend } from "../backend/client";
import { tenantDb, type TenantDb } from "../tenant-db";
import type { RequestMeta } from "./session";

export interface Actor {
  userId: string | null;
  name: string;
  role?: string | null;
}

export interface ServiceContext {
  restaurantId: string;
  db: TenantDb;
  actor: Actor;
  permissions: ReadonlySet<string> | "all";
  meta?: RequestMeta;
}

export interface RestaurantContext extends ServiceContext {
  kind: "restaurant";
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
    suspendedAt: Date | null;
    suspendReason: string | null;
  };
  membership: { roleName: string; isOwner: boolean };
  modules: ReadonlySet<ModuleKey>;
  plan: { key: string; name: string; flags: ReadonlySet<string> } | null;
}

export interface PlatformContext {
  kind: "platform";
  user: { id: string; name: string; email: string; avatarUrl: string | null; platformRole: string };
  actor: Actor;
  meta?: RequestMeta;
}

interface SessionInfo {
  user: RestaurantContext["user"];
  restaurant: Omit<RestaurantContext["restaurant"], "suspendedAt"> & { suspendedAt: string | null };
  role: { name: string; isOwner: boolean };
  modules: string[];
  permissions: string[];
  plan: { key: string; name: string; flags: string[] } | null;
}

interface AdminProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  platformRole: string;
}

async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return null;
    throw error;
  }
}

export async function loadRestaurantContext(token: string | undefined | null, meta?: RequestMeta): Promise<RestaurantContext | null> {
  if (!token) return null;
  const info = await orNull(() => backend.get<SessionInfo>("/api/v1/auth/me"));
  if (!info) return null;
  return {
    kind: "restaurant",
    restaurantId: info.restaurant.id,
    db: tenantDb(info.restaurant.id),
    actor: { userId: info.user.id, name: info.user.name, role: info.role.name },
    permissions: new Set(info.permissions as PermissionKey[]),
    meta,
    user: info.user,
    restaurant: { ...info.restaurant, suspendedAt: info.restaurant.suspendedAt ? new Date(info.restaurant.suspendedAt) : null },
    membership: { roleName: info.role.name, isOwner: info.role.isOwner },
    modules: new Set(info.modules as ModuleKey[]),
    plan: info.plan ? { key: info.plan.key, name: info.plan.name, flags: new Set(info.plan.flags) } : null,
  };
}

export async function loadPlatformContext(token: string | undefined | null, meta?: RequestMeta): Promise<PlatformContext | null> {
  if (!token) return null;
  const profile = await orNull(() => backend.get<AdminProfile>("/api/v1/admin/me"));
  if (!profile) return null;
  return {
    kind: "platform",
    user: { id: profile.id, name: profile.name, email: profile.email, avatarUrl: null, platformRole: profile.platformRole },
    actor: { userId: profile.id, name: profile.name, role: "Super Admin" },
    meta,
  };
}

export function systemContext(restaurantId: string, actorName = "System"): ServiceContext {
  return {
    restaurantId,
    db: tenantDb(restaurantId),
    actor: { userId: null, name: actorName, role: "System" },
    permissions: "all",
  };
}

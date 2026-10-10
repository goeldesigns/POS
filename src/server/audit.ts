import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import type { PlatformContext, ServiceContext } from "./auth/context";

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

type AuditWriter = { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } };

/** Record an action performed inside a restaurant. */
export async function audit(ctx: ServiceContext, entry: AuditEntry, tx?: AuditWriter) {
  const writer = (tx ?? ctx.db) as AuditWriter;
  await writer.auditLog.create({
    data: {
      scope: "RESTAURANT",
      restaurantId: ctx.restaurantId,
      userId: ctx.actor.userId,
      actorName: ctx.actor.name,
      actorRole: ctx.actor.role ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      ipAddress: ctx.meta?.ip ?? null,
      userAgent: ctx.meta?.userAgent?.slice(0, 255) ?? null,
      metadata: entry.metadata,
    },
  });
}

/** Record a platform (Super Admin) action, optionally about a restaurant. */
export async function auditPlatform(
  ctx: Pick<PlatformContext, "actor" | "meta">,
  entry: AuditEntry & { restaurantId?: string | null },
) {
  await prisma.auditLog.create({
    data: {
      scope: "PLATFORM",
      restaurantId: entry.restaurantId ?? null,
      userId: ctx.actor.userId,
      actorName: ctx.actor.name,
      actorRole: ctx.actor.role ?? "Super Admin",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      ipAddress: ctx.meta?.ip ?? null,
      userAgent: ctx.meta?.userAgent?.slice(0, 255) ?? null,
      metadata: entry.metadata,
    },
  });
}

import { ALL_PERMISSIONS, ALL_PERMISSION_KEYS } from "@/lib/permissions/catalog";
import { prisma } from "../db";

/** Mirror the code-defined permission catalogue into the Permission table. */
export async function syncPermissionCatalog() {
  await prisma.$transaction([
    ...ALL_PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, module: p.module, action: p.action, label: p.label, sortOrder: p.sortOrder },
        update: { module: p.module, action: p.action, label: p.label, sortOrder: p.sortOrder },
      }),
    ),
    prisma.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSION_KEYS } } }),
  ]);
}

let synced: Promise<void> | null = null;

/** Idempotent, once per process. */
export function ensurePermissionCatalog(): Promise<void> {
  synced ??= syncPermissionCatalog().catch((error) => {
    synced = null;
    throw error;
  });
  return synced;
}

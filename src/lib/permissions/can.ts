import {
  ALL_PERMISSION_KEYS,
  CORE_MODULES,
  isPermissionKey,
  moduleOf,
  type ModuleKey,
  type PermissionKey,
} from "./catalog";

/** Anything that carries an effective permission set. */
export interface PermissionSubject {
  permissions: ReadonlySet<string> | readonly string[];
}

function toSet(perms: PermissionSubject["permissions"]): ReadonlySet<string> {
  return perms instanceof Set ? perms : new Set(perms as readonly string[]);
}

/**
 * Central permission check used by pages, server actions, API handlers and
 * client components alike. The subject's permission set is already the
 * *effective* set (role ∪ grants − denies, limited to enabled modules).
 */
export function can(subject: PermissionSubject | null | undefined, key: PermissionKey): boolean {
  if (!subject) return false;
  return toSet(subject.permissions).has(key);
}

export function canAny(subject: PermissionSubject | null | undefined, keys: readonly PermissionKey[]): boolean {
  return keys.some((key) => can(subject, key));
}

export function canAll(subject: PermissionSubject | null | undefined, keys: readonly PermissionKey[]): boolean {
  return keys.every((key) => can(subject, key));
}

export interface PermissionOverride {
  permissionKey: string;
  effect: "GRANT" | "DENY";
}

export interface EffectivePermissionInput {
  isOwner: boolean;
  rolePermissions: readonly string[];
  overrides: readonly PermissionOverride[];
  enabledModules: readonly string[];
}

/**
 * Resolve the effective permission set for a membership.
 *
 *   owner        → every permission
 *   otherwise    → role permissions + GRANT overrides − DENY overrides
 *   always       → restricted to modules enabled for the restaurant
 */
export function computeEffectivePermissions(input: EffectivePermissionInput): Set<PermissionKey> {
  const enabled = new Set<string>([...input.enabledModules, ...CORE_MODULES]);
  const result = new Set<PermissionKey>();

  if (input.isOwner) {
    for (const key of ALL_PERMISSION_KEYS) result.add(key);
  } else {
    for (const key of input.rolePermissions) if (isPermissionKey(key)) result.add(key);
    for (const o of input.overrides) {
      if (!isPermissionKey(o.permissionKey)) continue;
      if (o.effect === "GRANT") result.add(o.permissionKey);
      else result.delete(o.permissionKey);
    }
  }

  for (const key of [...result]) {
    if (!enabled.has(moduleOf(key))) result.delete(key);
  }
  return result;
}

/** Modules a subject can open (has `<module>.view`). */
export function visibleModules(subject: PermissionSubject): ModuleKey[] {
  const set = toSet(subject.permissions);
  const modules = new Set<ModuleKey>();
  for (const key of set) {
    if (key.endsWith(".view") && isPermissionKey(key)) modules.add(moduleOf(key));
  }
  return [...modules];
}

/**
 * Turn a desired permission set into minimal overrides relative to a role.
 * Used when an admin edits a single user's matrix.
 */
export function diffAgainstRole(
  rolePermissions: readonly string[],
  desired: readonly string[],
): PermissionOverride[] {
  const role = new Set(rolePermissions);
  const want = new Set(desired);
  const overrides: PermissionOverride[] = [];
  for (const key of want) if (!role.has(key)) overrides.push({ permissionKey: key, effect: "GRANT" });
  for (const key of role) if (!want.has(key)) overrides.push({ permissionKey: key, effect: "DENY" });
  return overrides;
}

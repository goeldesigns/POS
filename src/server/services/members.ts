import { diffAgainstRole } from "@/lib/permissions/can";
import { ALL_PERMISSION_KEYS, isPermissionKey } from "@/lib/permissions/catalog";
import { prisma } from "../db";
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { revokeUserSessions } from "../auth/session";
import type { ServiceContext } from "../auth/load-context";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, PlanLimitError } from "../errors";
import { ensurePermissionCatalog } from "./catalog-sync";

/** Owners and trusted system/platform contexts can grant anything. */
export function actorIsUnrestricted(ctx: ServiceContext): boolean {
  if (ctx.permissions === "all") return true;
  return "membership" in ctx && (ctx as { membership: { isOwner: boolean } }).membership.isOwner;
}

/** Prevent privilege escalation: you can only hand out permissions you hold. */
function assertCanGrant(ctx: ServiceContext, keys: readonly string[]) {
  if (actorIsUnrestricted(ctx)) return;
  const held = ctx.permissions as ReadonlySet<string>;
  const missing = keys.filter((k) => !held.has(k));
  if (missing.length) throw new ForbiddenError("You can only grant permissions you have yourself");
}

export async function listMembers(ctx: ServiceContext) {
  return ctx.db.restaurantUser.findMany({
    orderBy: [{ role: { isOwner: "desc" } }, { user: { name: "asc" } }],
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true, status: true } },
      role: { select: { id: true, name: true, isOwner: true } },
      permissions: { select: { permissionKey: true, effect: true } },
      staff: { select: { id: true, employeeCode: true } },
    },
  });
}

export async function listRoles(ctx: ServiceContext) {
  return ctx.db.role.findMany({
    orderBy: [{ isOwner: "desc" }, { isSystem: "desc" }, { name: "asc" }],
    include: { permissions: { select: { permissionKey: true } }, _count: { select: { members: true } } },
  });
}

async function assertSeatAvailable(ctx: ServiceContext) {
  const sub = await ctx.db.subscription.findFirst({ include: { plan: true } });
  const limit = sub?.plan.maxUsers;
  if (!limit) return;
  const count = await ctx.db.restaurantUser.count();
  if (count >= limit) {
    throw new PlanLimitError(`The ${sub!.plan.name} plan allows ${limit} users. Upgrade the plan to add more.`);
  }
}

export interface CreateMemberInput {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  roleId: string;
  status?: "ACTIVE" | "SUSPENDED";
  permissions?: string[];
}

export async function createMember(ctx: ServiceContext, input: CreateMemberInput) {
  await ensurePermissionCatalog();
  await assertSeatAvailable(ctx);

  const role = await ctx.db.role.findUnique({
    where: { id: input.roleId },
    include: { permissions: { select: { permissionKey: true } } },
  });
  if (!role) throw new NotFoundError("Role");
  if (role.isOwner && !actorIsUnrestricted(ctx)) throw new ForbiddenError("Only an owner can add another owner");
  assertCanGrant(ctx, role.permissions.map((p) => p.permissionKey));
  if (input.permissions) assertCanGrant(ctx, input.permissions);

  const email = input.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  const attachedExisting = !!user;
  if (user) {
    const existing = await ctx.db.restaurantUser.findFirst({ where: { userId: user.id } });
    if (existing) throw new ConflictError("This person already has access to this restaurant");
    if (user.platformRole) throw new ConflictError("This email belongs to a platform administrator");
  } else {
    user = await prisma.user.create({
      data: { email, name: input.name, phone: input.phone ?? null, passwordHash: await hashPassword(input.password) },
    });
  }

  const member = await ctx.db.restaurantUser.create({
    data: {
      restaurantId: ctx.restaurantId,
      userId: user.id,
      roleId: role.id,
      status: input.status ?? "ACTIVE",
    },
  });

  if (input.permissions) {
    await writeOverrides(ctx, member.id, role.permissions.map((p) => p.permissionKey), input.permissions);
  }

  await audit(ctx, {
    action: "member.created",
    entity: "User",
    entityId: user.id,
    summary: `${ctx.actor.name} gave ${input.name} access as ${role.name}`,
  });
  return { member, user, attachedExisting };
}

async function writeOverrides(ctx: ServiceContext, memberId: string, rolePerms: string[], desired: string[]) {
  const clean = desired.filter(isPermissionKey);
  const overrides = diffAgainstRole(rolePerms, clean);
  await ctx.db.userPermission.deleteMany({ where: { restaurantUserId: memberId } });
  if (overrides.length) {
    await ctx.db.userPermission.createMany({
      data: overrides.map((o) => ({
        restaurantId: ctx.restaurantId,
        restaurantUserId: memberId,
        permissionKey: o.permissionKey,
        effect: o.effect,
      })),
    });
  }
}

async function getMember(ctx: ServiceContext, memberId: string) {
  const member = await ctx.db.restaurantUser.findUnique({
    where: { id: memberId },
    include: { role: { include: { permissions: true } }, user: true },
  });
  if (!member) throw new NotFoundError("Team member");
  return member;
}

async function assertNotLastOwner(ctx: ServiceContext, memberId: string) {
  const owners = await ctx.db.restaurantUser.findMany({
    where: { status: "ACTIVE", role: { isOwner: true } },
    select: { id: true },
  });
  if (owners.length <= 1 && owners[0]?.id === memberId) {
    throw new BusinessRuleError("A restaurant needs at least one active owner");
  }
}

export async function updateMember(
  ctx: ServiceContext,
  input: { memberId: string; roleId: string; status: "ACTIVE" | "SUSPENDED" },
) {
  const member = await getMember(ctx, input.memberId);
  const unrestricted = actorIsUnrestricted(ctx);
  if (member.role.isOwner && !unrestricted) throw new ForbiddenError("Only an owner can change another owner");
  if (member.userId === ctx.actor.userId && input.status !== "ACTIVE") {
    throw new BusinessRuleError("You can't suspend your own access");
  }

  const role = await ctx.db.role.findUnique({ where: { id: input.roleId }, include: { permissions: true } });
  if (!role) throw new NotFoundError("Role");
  if (role.isOwner && !unrestricted) throw new ForbiddenError("Only an owner can assign the Owner role");
  assertCanGrant(ctx, role.permissions.map((p) => p.permissionKey));

  if (member.role.isOwner && (!role.isOwner || input.status !== "ACTIVE")) await assertNotLastOwner(ctx, member.id);

  await ctx.db.restaurantUser.update({
    where: { id: member.id },
    data: { roleId: role.id, status: input.status },
  });
  if (input.status === "SUSPENDED") await revokeUserSessions(member.userId, { restaurantId: ctx.restaurantId });

  await audit(ctx, {
    action: "member.updated",
    entity: "User",
    entityId: member.userId,
    summary: `${ctx.actor.name} set ${member.user.name} to ${role.name} (${input.status.toLowerCase()})`,
  });
}

/** Save a user's permission matrix as minimal overrides against their role. */
export async function setMemberPermissions(ctx: ServiceContext, memberId: string, permissions: string[]) {
  const member = await getMember(ctx, memberId);
  if (member.role.isOwner) throw new BusinessRuleError("Owners always have full access");
  const rolePerms = member.role.permissions.map((p) => p.permissionKey);
  const desired = permissions.filter(isPermissionKey);
  const added = desired.filter((k) => !rolePerms.includes(k));
  assertCanGrant(ctx, added);
  await writeOverrides(ctx, member.id, rolePerms, desired);
  await audit(ctx, {
    action: "member.permissions_updated",
    entity: "User",
    entityId: member.userId,
    summary: `${ctx.actor.name} updated permissions for ${member.user.name}`,
    metadata: { permissions: desired },
  });
}

export async function resetMemberPassword(ctx: ServiceContext, memberId: string, password: string) {
  const member = await getMember(ctx, memberId);
  if (!actorIsUnrestricted(ctx) && member.role.isOwner) throw new ForbiddenError();
  if (ctx.permissions !== "all") {
    // A restaurant may only reset credentials for people who work solely there.
    const memberships = await prisma.restaurantUser.count({ where: { userId: member.userId } });
    if (memberships > 1) {
      throw new BusinessRuleError("This person also works at another restaurant. Ask them to use “Forgot password”.");
    }
  }
  await prisma.user.update({ where: { id: member.userId }, data: { passwordHash: await hashPassword(password) } });
  await revokeUserSessions(member.userId);
  await audit(ctx, {
    action: "member.password_reset",
    entity: "User",
    entityId: member.userId,
    summary: `${ctx.actor.name} reset the password for ${member.user.name}`,
  });
}

export async function removeMember(ctx: ServiceContext, memberId: string) {
  const member = await getMember(ctx, memberId);
  if (member.userId === ctx.actor.userId) throw new BusinessRuleError("You can't remove yourself");
  if (member.role.isOwner) {
    if (!actorIsUnrestricted(ctx)) throw new ForbiddenError("Only an owner can remove an owner");
    await assertNotLastOwner(ctx, member.id);
  }
  await ctx.db.restaurantUser.delete({ where: { id: member.id } });
  await revokeUserSessions(member.userId, { restaurantId: ctx.restaurantId });
  await audit(ctx, {
    action: "member.removed",
    entity: "User",
    entityId: member.userId,
    summary: `${ctx.actor.name} removed ${member.user.name}'s access`,
  });
}

export async function saveRole(
  ctx: ServiceContext,
  input: { id?: string; name: string; description?: string | null; permissions: string[] },
) {
  await ensurePermissionCatalog();
  const permissions = input.permissions.filter(isPermissionKey);
  assertCanGrant(ctx, permissions);

  if (input.id) {
    const role = await ctx.db.role.findUnique({ where: { id: input.id } });
    if (!role) throw new NotFoundError("Role");
    if (role.isOwner) throw new BusinessRuleError("The Owner role always has full access and can't be edited");
    await ctx.db.role.update({ where: { id: role.id }, data: { name: input.name, description: input.description ?? null } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length) {
      await prisma.rolePermission.createMany({ data: permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
    }
    await audit(ctx, { action: "role.updated", entity: "Role", entityId: role.id, summary: `${ctx.actor.name} updated role ${input.name}` });
    return role.id;
  }

  const role = await ctx.db.role.create({
    data: {
      restaurantId: ctx.restaurantId,
      name: input.name,
      description: input.description ?? null,
      permissions: { create: permissions.map((permissionKey) => ({ permissionKey })) },
    },
  });
  await audit(ctx, { action: "role.created", entity: "Role", entityId: role.id, summary: `${ctx.actor.name} created role ${input.name}` });
  return role.id;
}

export async function deleteRole(ctx: ServiceContext, roleId: string) {
  const role = await ctx.db.role.findUnique({ where: { id: roleId }, include: { _count: { select: { members: true } } } });
  if (!role) throw new NotFoundError("Role");
  if (role.isSystem) throw new BusinessRuleError("System roles can't be deleted");
  if (role._count.members > 0) throw new BusinessRuleError("Move the people in this role to another role first");
  await ctx.db.role.delete({ where: { id: role.id } });
  await audit(ctx, { action: "role.deleted", entity: "Role", entityId: role.id, summary: `${ctx.actor.name} deleted role ${role.name}` });
}

export { ALL_PERMISSION_KEYS };

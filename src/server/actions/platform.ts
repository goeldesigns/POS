"use server";

import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import { CORE_MODULES, MODULE_CATALOG, MODULE_KEYS, PLAN_FLAGS, isModuleKey, type ModuleKey } from "@/lib/permissions/catalog";
import {
  adminMemberPermissionsSchema,
  adminMemberRefSchema,
  adminResetPasswordSchema,
  adminUpdateMemberSchema,
  archiveRestaurantSchema,
  changeSubscriptionSchema,
  createPlatformUserSchema,
  createRestaurantSchema,
  planIdSchema,
  planSchema,
  platformSettingsSchema,
  restaurantIdSchema,
  restaurantModulesSchema,
  suspendRestaurantSchema,
  updateRestaurantSchema,
  userStatusSchema,
} from "@/lib/validation/platform";
import { demoIdSchema, demoStatusSchema, updateDemoSchema } from "@/lib/validation/demo";
import { platformAction } from "../action";
import { auditPlatform } from "../audit";
import { revokeUserSessions } from "../auth/session";
import { prisma } from "../db";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { createMember, removeMember, resetMemberPassword, setMemberPermissions, updateMember } from "../services/members";
import { createRestaurantTenant, planModuleKeys } from "../services/onboarding";
import { deleteDemoRequest, setDemoStatus, updateDemoRequest } from "../services/demos";
import { adminServiceContext, listRoleOptions } from "../services/platform";

async function findRestaurant(id: string) {
  const r = await prisma.restaurant.findUnique({ where: { id }, select: { id: true, name: true, status: true, timezone: true, deletedAt: true } });
  if (!r) throw new NotFoundError("Restaurant");
  return r;
}

async function findLiveRestaurant(id: string) {
  const r = await findRestaurant(id);
  if (r.status === "ARCHIVED") throw new BusinessRuleError("This restaurant is archived. Restore it first.");
  return r;
}

// ─── Restaurants ────────────────────────────────────────────────────────────

export const createRestaurantAction = platformAction({ schema: createRestaurantSchema }, async (input, ctx) => {
  const { restaurant } = await createRestaurantTenant({
    profile: {
      name: input.name,
      legalName: input.legalName,
      ownerName: input.ownerName,
      email: input.email,
      phone: input.phone,
      addressLine: input.addressLine,
      city: input.city,
      state: input.state,
      country: input.country,
      postalCode: input.postalCode,
      gstNumber: input.gstNumber,
      fssaiNumber: input.fssaiNumber,
      currency: input.currency,
      timezone: input.timezone,
      restaurantType: input.restaurantType,
    },
    config: {
      numberOfTables: input.numberOfTables,
      taxRate: input.taxRate,
      taxInclusive: input.taxInclusive,
      serviceChargePercent: input.serviceChargePercent,
      defaultOrderType: input.defaultOrderType,
      receiptHeader: input.receiptHeader,
      receiptFooter: input.receiptFooter,
    },
    owner: { name: input.ownerName, email: input.loginEmail, password: input.password, phone: input.phone },
    planKey: input.planKey,
    modules: input.modules,
  });
  await auditPlatform(ctx, {
    action: "restaurant.created",
    entity: "Restaurant",
    entityId: restaurant.id,
    restaurantId: restaurant.id,
    summary: `${ctx.actor.name} created ${restaurant.name} (${input.planKey} plan)`,
    metadata: { planKey: input.planKey, ownerEmail: input.loginEmail, ...(input.demoRequestId ? { demoRequestId: input.demoRequestId } : {}) },
  });
  if (input.demoRequestId) {
    const demo = await prisma.demoRequest.findUnique({ where: { id: input.demoRequestId } });
    if (demo && !demo.restaurantId) {
      await prisma.demoRequest.update({
        where: { id: demo.id },
        data: { restaurantId: restaurant.id, ...(demo.status === "COMPLETED" ? {} : { status: "COMPLETED", completedAt: new Date() }) },
      });
      await auditPlatform(ctx, {
        action: "demo.converted",
        entity: "DemoRequest",
        entityId: demo.id,
        restaurantId: restaurant.id,
        summary: `${demo.restaurantName} became a customer after their demo`,
      });
    }
  }
  return { id: restaurant.id };
});

export const updateRestaurantAction = platformAction({ schema: updateRestaurantSchema }, async (input, ctx) => {
  const before = await prisma.restaurant.findUnique({ where: { id: input.id } });
  if (!before) throw new NotFoundError("Restaurant");
  const { id, ...data } = input;
  await prisma.restaurant.update({ where: { id }, data });
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => (before[k] ?? null) !== (data[k] ?? null));
  await auditPlatform(ctx, {
    action: "restaurant.updated",
    entity: "Restaurant",
    entityId: id,
    restaurantId: id,
    summary: `${ctx.actor.name} updated ${data.name}'s profile${changed.length ? ` (${changed.join(", ")})` : ""}`,
    metadata: { changed },
  });
  return { id };
});

export const suspendRestaurantAction = platformAction({ schema: suspendRestaurantSchema }, async (input, ctx) => {
  const r = await findLiveRestaurant(input.id);
  if (r.status === "SUSPENDED") throw new BusinessRuleError(`${r.name} is already suspended`);
  await prisma.restaurant.update({
    where: { id: r.id },
    data: { status: "SUSPENDED", suspendedAt: new Date(), suspendReason: input.reason },
  });
  await auditPlatform(ctx, {
    action: "restaurant.suspended",
    entity: "Restaurant",
    entityId: r.id,
    restaurantId: r.id,
    summary: `${ctx.actor.name} suspended ${r.name} — ${input.reason}`,
    metadata: { reason: input.reason },
  });
  return { id: r.id };
});

/** Re-activates a suspended restaurant, or restores an archived one. */
export const activateRestaurantAction = platformAction({ schema: restaurantIdSchema }, async (input, ctx) => {
  const r = await findRestaurant(input.id);
  if (r.status === "ACTIVE") throw new BusinessRuleError(`${r.name} is already active`);
  await prisma.restaurant.update({
    where: { id: r.id },
    data: { status: "ACTIVE", suspendedAt: null, suspendReason: null, deletedAt: null },
  });
  const restored = r.status === "ARCHIVED";
  await auditPlatform(ctx, {
    action: restored ? "restaurant.restored" : "restaurant.activated",
    entity: "Restaurant",
    entityId: r.id,
    restaurantId: r.id,
    summary: `${ctx.actor.name} ${restored ? "restored" : "re-activated"} ${r.name}`,
  });
  return { id: r.id };
});

/**
 * Soft delete: the restaurant disappears from every list, all sessions and API
 * keys stop working, and data is retained so it can be restored.
 */
export const archiveRestaurantAction = platformAction({ schema: archiveRestaurantSchema }, async (input, ctx) => {
  const r = await findRestaurant(input.id);
  if (r.status === "ARCHIVED") throw new BusinessRuleError(`${r.name} is already archived`);
  if (input.confirmName.trim() !== r.name) {
    throw new BusinessRuleError("The name you typed doesn't match the restaurant name");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.restaurant.update({ where: { id: r.id }, data: { status: "ARCHIVED", deletedAt: now } }),
    prisma.session.deleteMany({ where: { restaurantId: r.id } }),
    prisma.apiKey.updateMany({ where: { restaurantId: r.id, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await auditPlatform(ctx, {
    action: "restaurant.archived",
    entity: "Restaurant",
    entityId: r.id,
    restaurantId: r.id,
    summary: `${ctx.actor.name} archived ${r.name}`,
  });
  return { id: r.id };
});

export const setRestaurantModulesAction = platformAction({ schema: restaurantModulesSchema }, async (input, ctx) => {
  const r = await findLiveRestaurant(input.restaurantId);
  const desired = new Set<ModuleKey>([...input.modules.filter(isModuleKey), ...CORE_MODULES]);
  const current = await prisma.restaurantModule.findMany({ where: { restaurantId: r.id } });
  const was = new Set(current.filter((m) => m.enabled).map((m) => m.moduleKey));
  await prisma.$transaction(
    MODULE_KEYS.map((moduleKey) =>
      prisma.restaurantModule.upsert({
        where: { restaurantId_moduleKey: { restaurantId: r.id, moduleKey } },
        create: { restaurantId: r.id, moduleKey, enabled: desired.has(moduleKey) },
        update: { enabled: desired.has(moduleKey) },
      }),
    ),
  );
  const enabled = MODULE_KEYS.filter((m) => desired.has(m) && !was.has(m));
  const disabled = MODULE_KEYS.filter((m) => !desired.has(m) && was.has(m));
  const label = (keys: ModuleKey[]) => keys.map((k) => MODULE_CATALOG[k].label).join(", ");
  await auditPlatform(ctx, {
    action: "restaurant.modules_changed",
    entity: "Restaurant",
    entityId: r.id,
    restaurantId: r.id,
    summary: `${ctx.actor.name} changed modules for ${r.name}${enabled.length ? ` · on: ${label(enabled)}` : ""}${disabled.length ? ` · off: ${label(disabled)}` : ""}`,
    metadata: { enabled, disabled },
  });
  return { enabled: enabled.length, disabled: disabled.length };
});

export const changeSubscriptionAction = platformAction({ schema: changeSubscriptionSchema }, async (input, ctx) => {
  const r = await findLiveRestaurant(input.restaurantId);
  const plan = await prisma.plan.findUnique({ where: { key: input.planKey } });
  if (!plan) throw new NotFoundError("Plan");
  const existing = await prisma.subscription.findUnique({ where: { restaurantId: r.id }, include: { plan: true } });
  if (!plan.isActive && existing?.planId !== plan.id) throw new BusinessRuleError(`The ${plan.name} plan is retired and can't be assigned`);

  const periodEnd = new TZDate(`${input.periodEnd}T23:59:59`, r.timezone);
  if (Number.isNaN(periodEnd.getTime())) throw new BusinessRuleError("Choose a valid period end date");
  const planChanged = existing?.planId !== plan.id;
  const now = new Date();
  const data = {
    planId: plan.id,
    status: input.status,
    billingInterval: input.billingInterval,
    currentPeriodEnd: new Date(periodEnd.getTime()),
    trialEndsAt: input.status === "TRIALING" ? new Date(periodEnd.getTime()) : null,
    cancelAtPeriodEnd: false,
  };
  await prisma.subscription.upsert({
    where: { restaurantId: r.id },
    create: { restaurantId: r.id, currentPeriodStart: now, ...data },
    update: { ...data, ...(planChanged ? { currentPeriodStart: now } : {}) },
  });

  if (input.applyPlanModules) {
    const keys = new Set<string>(await planModuleKeys(plan.key));
    await prisma.$transaction(
      MODULE_KEYS.map((moduleKey) =>
        prisma.restaurantModule.upsert({
          where: { restaurantId_moduleKey: { restaurantId: r.id, moduleKey } },
          create: { restaurantId: r.id, moduleKey, enabled: keys.has(moduleKey) },
          update: { enabled: keys.has(moduleKey) },
        }),
      ),
    );
  }

  const warnings: string[] = [];
  if (plan.maxUsers) {
    const users = await prisma.restaurantUser.count({ where: { restaurantId: r.id } });
    if (users > plan.maxUsers) warnings.push(`${r.name} has ${users} users; ${plan.name} allows ${plan.maxUsers}. Existing users keep access, new ones can't be added.`);
  }

  const parts = [
    planChanged ? `${existing?.plan.name ?? "no plan"} → ${plan.name}` : plan.name,
    input.status.toLowerCase().replace("_", " "),
    input.billingInterval.toLowerCase(),
    `until ${input.periodEnd}`,
  ];
  await auditPlatform(ctx, {
    action: "subscription.changed",
    entity: "Subscription",
    entityId: r.id,
    restaurantId: r.id,
    summary: `${ctx.actor.name} updated ${r.name}'s subscription: ${parts.join(" · ")}${input.applyPlanModules ? " (modules reset to plan)" : ""}`,
    metadata: { from: existing?.plan.key ?? null, to: plan.key, status: input.status, interval: input.billingInterval },
  });
  return { warnings };
});

// ─── People inside a restaurant ─────────────────────────────────────────────

export const getRestaurantRolesAction = platformAction(
  { schema: z.object({ restaurantId: z.string().min(1) }), revalidate: false },
  async (input) => {
    await findLiveRestaurant(input.restaurantId);
    return listRoleOptions(input.restaurantId);
  },
);

export const createRestaurantUserAction = platformAction({ schema: createPlatformUserSchema }, async (input, ctx) => {
  const r = await findLiveRestaurant(input.restaurantId);
  const result = await createMember(adminServiceContext(ctx, r.id), {
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: input.password,
    roleId: input.roleId,
    status: input.status,
    permissions: input.permissions,
  });
  return { memberId: result.member.id, attachedExisting: result.attachedExisting };
});

export const updateRestaurantMemberAction = platformAction({ schema: adminUpdateMemberSchema }, async (input, ctx) => {
  await findLiveRestaurant(input.restaurantId);
  await updateMember(adminServiceContext(ctx, input.restaurantId), input);
  return { ok: true };
});

export const setRestaurantMemberPermissionsAction = platformAction({ schema: adminMemberPermissionsSchema }, async (input, ctx) => {
  await findLiveRestaurant(input.restaurantId);
  await setMemberPermissions(adminServiceContext(ctx, input.restaurantId), input.memberId, input.permissions);
  return { ok: true };
});

export const resetRestaurantMemberPasswordAction = platformAction({ schema: adminResetPasswordSchema }, async (input, ctx) => {
  await findLiveRestaurant(input.restaurantId);
  await resetMemberPassword(adminServiceContext(ctx, input.restaurantId), input.memberId, input.password);
  return { ok: true };
});

export const removeRestaurantMemberAction = platformAction({ schema: adminMemberRefSchema }, async (input, ctx) => {
  await findLiveRestaurant(input.restaurantId);
  await removeMember(adminServiceContext(ctx, input.restaurantId), input.memberId);
  return { ok: true };
});

/** Disable or re-enable a person's sign-in across every restaurant. */
export const setUserStatusAction = platformAction({ schema: userStatusSchema }, async (input, ctx) => {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, platformRole: true, status: true } });
  if (!user) throw new NotFoundError("User");
  if (user.platformRole) throw new ForbiddenError("Platform administrators are managed outside the console");
  if (user.status === input.status) return { ok: true };
  await prisma.user.update({ where: { id: user.id }, data: { status: input.status } });
  if (input.status === "DISABLED") await revokeUserSessions(user.id);
  await auditPlatform(ctx, {
    action: input.status === "DISABLED" ? "user.disabled" : "user.enabled",
    entity: "User",
    entityId: user.id,
    summary: `${ctx.actor.name} ${input.status === "DISABLED" ? "disabled sign-in for" : "re-enabled sign-in for"} ${user.name}`,
  });
  return { ok: true };
});

// ─── Plans ──────────────────────────────────────────────────────────────────

export const savePlanAction = platformAction({ schema: planSchema }, async (input, ctx) => {
  const features = [
    ...new Set([...input.features.filter((f) => isModuleKey(f) || f in PLAN_FLAGS), ...CORE_MODULES]),
  ];
  const data = {
    name: input.name,
    description: input.description,
    priceMonthly: input.priceMonthly,
    priceYearly: input.priceYearly,
    trialDays: input.trialDays,
    maxUsers: input.maxUsers,
    maxTables: input.maxTables,
    maxProducts: input.maxProducts,
    maxLocations: input.maxLocations,
    isActive: input.isActive,
    isPublic: input.isPublic,
  };

  if (input.id) {
    const plan = await prisma.plan.findUnique({ where: { id: input.id } });
    if (!plan) throw new NotFoundError("Plan");
    if (!input.isActive && plan.isActive) await assertNotDefaultPlan(plan.key, "retired");
    await prisma.$transaction([
      prisma.plan.update({ where: { id: plan.id }, data }),
      prisma.subscriptionFeature.deleteMany({ where: { planId: plan.id } }),
      prisma.subscriptionFeature.createMany({ data: features.map((featureKey) => ({ planId: plan.id, featureKey })) }),
    ]);
    await auditPlatform(ctx, { action: "plan.updated", entity: "Plan", entityId: plan.id, summary: `${ctx.actor.name} updated the ${input.name} plan`, metadata: { features } });
    return { id: plan.id };
  }

  if (await prisma.plan.findUnique({ where: { key: input.key } })) throw new ConflictError("A plan with this key already exists");
  const last = await prisma.plan.aggregate({ _max: { sortOrder: true } });
  const plan = await prisma.plan.create({
    data: {
      key: input.key,
      ...data,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      features: { create: features.map((featureKey) => ({ featureKey })) },
    },
  });
  await auditPlatform(ctx, { action: "plan.created", entity: "Plan", entityId: plan.id, summary: `${ctx.actor.name} created the ${plan.name} plan`, metadata: { features } });
  return { id: plan.id };
});

async function assertNotDefaultPlan(key: string, verb: string) {
  const row = await prisma.platformSetting.findUnique({ where: { key: "defaultPlanKey" } });
  if (row?.value === key) throw new BusinessRuleError(`This is the default plan for new sign-ups and can't be ${verb}. Change the default in Settings first.`);
}

export const deletePlanAction = platformAction({ schema: planIdSchema }, async (input, ctx) => {
  const plan = await prisma.plan.findUnique({ where: { id: input.id }, include: { _count: { select: { subscriptions: true } } } });
  if (!plan) throw new NotFoundError("Plan");
  if (plan._count.subscriptions > 0) {
    throw new BusinessRuleError(`${plan._count.subscriptions} restaurant(s) are on ${plan.name}. Move them to another plan, or retire the plan instead.`);
  }
  await assertNotDefaultPlan(plan.key, "deleted");
  await prisma.plan.delete({ where: { id: plan.id } });
  await auditPlatform(ctx, { action: "plan.deleted", entity: "Plan", entityId: plan.id, summary: `${ctx.actor.name} deleted the ${plan.name} plan` });
  return { ok: true };
});

// ─── Platform settings ──────────────────────────────────────────────────────

export const savePlatformSettingsAction = platformAction({ schema: platformSettingsSchema }, async (input, ctx) => {
  const plan = await prisma.plan.findUnique({ where: { key: input.defaultPlanKey } });
  if (!plan || !plan.isActive) throw new BusinessRuleError("Choose an active plan as the default");
  const values: Record<string, string | boolean> = {
    platformName: input.platformName,
    supportEmail: input.supportEmail,
    supportPhone: input.supportPhone ?? "",
    defaultPlanKey: input.defaultPlanKey,
    allowSelfSignup: input.allowSelfSignup,
    maintenanceBanner: input.maintenanceBanner ?? "",
  };
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
  await auditPlatform(ctx, {
    action: "platform.settings_updated",
    entity: "PlatformSetting",
    summary: `${ctx.actor.name} updated platform settings`,
    metadata: { defaultPlanKey: input.defaultPlanKey, allowSelfSignup: input.allowSelfSignup },
  });
  return { ok: true };
});

// ─── Demo requests ──────────────────────────────────────────────────────────

export const updateDemoAction = platformAction({ schema: updateDemoSchema }, async (input, ctx) => updateDemoRequest(ctx, input));

export const setDemoStatusAction = platformAction({ schema: demoStatusSchema }, async (input, ctx) => setDemoStatus(ctx, input.id, input.status));

export const deleteDemoAction = platformAction({ schema: demoIdSchema }, async (input, ctx) => {
  await deleteDemoRequest(ctx, input.id);
  return { ok: true };
});

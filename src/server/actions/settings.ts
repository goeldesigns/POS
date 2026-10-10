"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { couponSchema, idSchema } from "@/lib/validation/operations";
import { taxRateSchema } from "@/lib/validation/menu";
import { isSettingsSection, RESTAURANT_FIELD_SECTIONS, SETTINGS_SCHEMAS } from "@/lib/validation/settings";
import { createMemberSchema, memberPermissionsSchema, resetMemberPasswordSchema, roleSchema, updateMemberSchema } from "@/lib/validation/team";
import { apiKeySchema } from "@/lib/validation/inventory";
import { restaurantAction } from "../action";
import { audit } from "../audit";
import { prisma } from "../db";
import { generateToken, hashToken } from "../crypto";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { SESSION_COOKIE } from "../auth/session";
import { createMember, deleteRole, removeMember, resetMemberPassword, saveRole, setMemberPermissions, updateMember } from "../services/members";

export const updateSettingsAction = restaurantAction(
  { permission: "settings.edit", schema: z.object({ section: z.string(), values: z.record(z.string(), z.unknown()) }) },
  async (input, ctx) => {
    if (!isSettingsSection(input.section)) throw new NotFoundError("Settings section");
    const schema = SETTINGS_SCHEMAS[input.section] as unknown as z.ZodType<Record<string, unknown>>;
    const parsed = schema.safeParse(input.values);
    if (!parsed.success) {
      throw new ValidationError("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }
    const data = parsed.data as Record<string, unknown>;
    if (RESTAURANT_FIELD_SECTIONS.includes(input.section)) {
      // The tenant root row: update strictly by the caller's own restaurant id.
      await prisma.restaurant.update({ where: { id: ctx.restaurantId }, data });
    } else {
      await ctx.db.restaurantSettings.update({ where: { restaurantId: ctx.restaurantId }, data });
    }
    await audit(ctx, { action: "settings.updated", entity: "Settings", summary: `${ctx.actor.name} updated ${input.section} settings`, metadata: { section: input.section } });
  },
);

// ─── Tax rates ──────────────────────────────────────────────────────────────

export const saveTaxRateAction = restaurantAction({ permission: "settings.edit", schema: taxRateSchema }, async (input, ctx) => {
  const { id, ...data } = input;
  if (data.isDefault) await ctx.db.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  if (id) await ctx.db.taxRate.update({ where: { id }, data });
  else await ctx.db.taxRate.create({ data: { ...data, restaurantId: ctx.restaurantId } });
  if (!(await ctx.db.taxRate.findFirst({ where: { isDefault: true } }))) {
    const first = await ctx.db.taxRate.findFirst({ where: { isActive: true }, orderBy: { rate: "asc" } });
    if (first) await ctx.db.taxRate.update({ where: { id: first.id }, data: { isDefault: true } });
  }
  await audit(ctx, { action: "tax.updated", entity: "TaxRate", summary: `${ctx.actor.name} saved tax rate ${input.name}` });
});

export const deleteTaxRateAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, async (input, ctx) => {
  const t = await ctx.db.taxRate.findUnique({ where: { id: input.id }, include: { _count: { select: { products: true } } } });
  if (!t) throw new NotFoundError("Tax rate");
  if (t.isDefault) throw new BusinessRuleError("Make another rate the default first");
  if (t._count.products) throw new BusinessRuleError(`${t._count.products} menu items use ${t.name}`);
  await ctx.db.taxRate.delete({ where: { id: t.id } });
});

// ─── Coupons ────────────────────────────────────────────────────────────────

export const saveCouponAction = restaurantAction({ permission: "settings.edit", schema: couponSchema }, async (input, ctx) => {
  const { id, ...rest } = input;
  const data = { ...rest, value: rest.type === "FLAT" ? Math.round(rest.value * 100) : rest.value };
  const clash = await ctx.db.coupon.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new ValidationError("This code already exists", { code: ["This code already exists"] });
  if (id) await ctx.db.coupon.update({ where: { id }, data });
  else await ctx.db.coupon.create({ data: { ...data, restaurantId: ctx.restaurantId } });
  await audit(ctx, { action: "coupon.saved", entity: "Coupon", summary: `${ctx.actor.name} saved coupon ${data.code}` });
});

export const deleteCouponAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, async (input, ctx) => {
  const c = await ctx.db.coupon.findUnique({ where: { id: input.id } });
  if (!c) throw new NotFoundError("Coupon");
  if (c.usedCount > 0) await ctx.db.coupon.update({ where: { id: c.id }, data: { isActive: false } });
  else await ctx.db.coupon.delete({ where: { id: c.id } });
});

// ─── Users & roles ──────────────────────────────────────────────────────────

export const createMemberAction = restaurantAction({ permission: "settings.edit", schema: createMemberSchema }, async (input, ctx) => {
  const r = await createMember(ctx, input);
  return { attachedExisting: r.attachedExisting };
});
export const updateMemberAction = restaurantAction({ permission: "settings.edit", schema: updateMemberSchema }, (input, ctx) => updateMember(ctx, input));
export const memberPermissionsAction = restaurantAction({ permission: "settings.edit", schema: memberPermissionsSchema }, (input, ctx) => setMemberPermissions(ctx, input.memberId, input.permissions));
export const resetMemberPasswordAction = restaurantAction({ permission: "settings.edit", schema: resetMemberPasswordSchema }, (input, ctx) => resetMemberPassword(ctx, input.memberId, input.password));
export const removeMemberAction = restaurantAction({ permission: "settings.edit", schema: z.object({ memberId: z.string().min(1) }) }, (input, ctx) => removeMember(ctx, input.memberId));
export const saveRoleAction = restaurantAction({ permission: "settings.edit", schema: roleSchema }, async (input, ctx) => {
  if (!input.id && ctx.plan && !ctx.plan.flags.has("custom_roles")) throw new BusinessRuleError(`Custom roles aren't included in the ${ctx.plan.name} plan`);
  return { id: await saveRole(ctx, input) };
});
export const deleteRoleAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, (input, ctx) => deleteRole(ctx, input.id));

// ─── API keys (public API for website / apps) ───────────────────────────────

export const createApiKeyAction = restaurantAction({ permission: "settings.edit", schema: apiKeySchema }, async (input, ctx) => {
  if (!ctx.plan?.flags.has("api_access")) throw new BusinessRuleError(`API access isn't included in the ${ctx.plan?.name ?? "current"} plan`);
  const raw = `tbl_live_${generateToken(24)}`;
  await ctx.db.apiKey.create({
    data: { restaurantId: ctx.restaurantId, name: input.name, prefix: raw.slice(0, 13), keyHash: hashToken(raw), scopes: input.scopes, createdById: ctx.user.id },
  });
  await audit(ctx, { action: "apikey.created", entity: "ApiKey", summary: `${ctx.actor.name} created API key “${input.name}” (${input.scopes.join(", ")})` });
  return { key: raw };
});

export const revokeApiKeyAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, async (input, ctx) => {
  const k = await ctx.db.apiKey.findUnique({ where: { id: input.id } });
  if (!k) throw new NotFoundError("API key");
  await ctx.db.apiKey.update({ where: { id: k.id }, data: { revokedAt: new Date() } });
  await audit(ctx, { action: "apikey.revoked", entity: "ApiKey", summary: `${ctx.actor.name} revoked API key “${k.name}”` });
});

// ─── Sessions ───────────────────────────────────────────────────────────────

export const signOutOtherSessionsAction = restaurantAction({ schema: z.object({}) }, async (_input, ctx) => {
  const token = (await cookies()).get(SESSION_COOKIE.RESTAURANT)?.value;
  const keep = token ? hashToken(token) : "";
  const r = await prisma.session.deleteMany({ where: { userId: ctx.user.id, scope: "RESTAURANT", NOT: { tokenHash: keep } } });
  return { count: r.count };
});

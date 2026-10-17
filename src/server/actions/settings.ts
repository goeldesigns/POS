"use server";

import { z } from "zod";
import { couponSchema, idSchema } from "@/lib/validation/operations";
import { taxRateSchema } from "@/lib/validation/menu";
import { isSettingsSection, SETTINGS_SCHEMAS } from "@/lib/validation/settings";
import { createMemberSchema, memberPermissionsSchema, resetMemberPasswordSchema, roleSchema, updateMemberSchema } from "@/lib/validation/team";
import { apiKeySchema } from "@/lib/validation/inventory";
import { restaurantAction } from "../action";
import { BusinessRuleError, NotFoundError, ValidationError } from "../errors";
import { createMember, deleteRole, removeMember, resetMemberPassword, saveRole, setMemberPermissions, updateMember } from "../services/members";
import {
  createApiKey,
  deleteCoupon,
  deleteTaxRate,
  revokeApiKey,
  saveCoupon,
  saveSettingsSection,
  saveTaxRate,
  signOutOtherSessions,
} from "../services/settings";

export const updateSettingsAction = restaurantAction(
  { permission: "settings.edit", schema: z.object({ section: z.string(), values: z.record(z.string(), z.unknown()) }) },
  async (input, ctx) => {
    if (!isSettingsSection(input.section)) throw new NotFoundError("Settings section");
    const schema = SETTINGS_SCHEMAS[input.section] as unknown as z.ZodType<Record<string, unknown>>;
    const parsed = schema.safeParse(input.values);
    if (!parsed.success) {
      throw new ValidationError("Please check the highlighted fields", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }
    await saveSettingsSection(ctx, input.section, parsed.data as Record<string, unknown>);
  },
);

export const saveTaxRateAction = restaurantAction({ permission: "settings.edit", schema: taxRateSchema }, (input, ctx) => saveTaxRate(ctx, input));

export const deleteTaxRateAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, (input, ctx) => deleteTaxRate(ctx, input.id));

export const saveCouponAction = restaurantAction({ permission: "settings.edit", schema: couponSchema }, (input, ctx) => saveCoupon(ctx, input));

export const deleteCouponAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, (input, ctx) => deleteCoupon(ctx, input.id));

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

export const createApiKeyAction = restaurantAction({ permission: "settings.edit", schema: apiKeySchema }, async (input, ctx) => {
  if (!ctx.plan?.flags.has("api_access")) throw new BusinessRuleError(`API access isn't included in the ${ctx.plan?.name ?? "current"} plan`);
  return createApiKey(ctx, input);
});

export const revokeApiKeyAction = restaurantAction({ permission: "settings.edit", schema: idSchema }, (input, ctx) => revokeApiKey(ctx, input.id));

export const signOutOtherSessionsAction = restaurantAction({ schema: z.object({}) }, (_input, ctx) => signOutOtherSessions(ctx));

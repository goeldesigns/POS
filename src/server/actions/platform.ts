"use server";

import { z } from "zod";
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
import { backend } from "../backend/client";
import { deleteDemoRequest, setDemoStatus, updateDemoRequest } from "../services/demos";
import { listRoleOptions } from "../services/platform";

const admin = "/api/v1/admin";

function profileOf(input: z.infer<typeof updateRestaurantSchema>) {
  const { id: _id, ...profile } = input;
  return profile;
}

// ─── Restaurants ────────────────────────────────────────────────────────────

export const createRestaurantAction = platformAction({ schema: createRestaurantSchema }, async (input) => {
  const {
    name, legalName, ownerName, email, phone, addressLine, city, state, country, postalCode, gstNumber, fssaiNumber, currency, timezone, restaurantType,
    numberOfTables, taxRate, taxInclusive, serviceChargePercent, defaultOrderType, receiptHeader, receiptFooter, planKey, modules, loginEmail, password, confirmPassword, demoRequestId,
  } = input;
  return backend.post<{ id: string }>(`${admin}/restaurants`, {
    profile: { name, legalName, ownerName, email, phone, addressLine, city, state, country, postalCode, gstNumber, fssaiNumber, currency, timezone, restaurantType },
    numberOfTables,
    taxRate,
    taxInclusive,
    serviceChargePercent,
    defaultOrderType,
    receiptHeader,
    receiptFooter,
    planKey,
    modules,
    loginEmail,
    password,
    confirmPassword,
    demoRequestId,
  });
});

export const updateRestaurantAction = platformAction({ schema: updateRestaurantSchema }, async (input) =>
  backend.put<{ id: string }>(`${admin}/restaurants/${input.id}`, profileOf(input)),
);

export const suspendRestaurantAction = platformAction({ schema: suspendRestaurantSchema }, async (input) => {
  await backend.post(`${admin}/restaurants/${input.id}/suspend`, { reason: input.reason });
  return { id: input.id };
});

export const activateRestaurantAction = platformAction({ schema: restaurantIdSchema }, async (input) => {
  await backend.post(`${admin}/restaurants/${input.id}/activate`);
  return { id: input.id };
});

export const archiveRestaurantAction = platformAction({ schema: archiveRestaurantSchema }, async (input) => {
  await backend.post(`${admin}/restaurants/${input.id}/archive`, { confirmName: input.confirmName });
  return { id: input.id };
});

export const setRestaurantModulesAction = platformAction({ schema: restaurantModulesSchema }, async (input) =>
  backend.put<{ enabled: number; disabled: number }>(`${admin}/restaurants/${input.restaurantId}/modules`, { modules: input.modules }),
);

export const changeSubscriptionAction = platformAction({ schema: changeSubscriptionSchema }, async (input) => {
  const { restaurantId, ...body } = input;
  return backend.put<{ warnings: string[] }>(`${admin}/restaurants/${restaurantId}/subscription`, body);
});

// ─── People inside a restaurant ─────────────────────────────────────────────

export const getRestaurantRolesAction = platformAction(
  { schema: z.object({ restaurantId: z.string().min(1) }), revalidate: false },
  async (input) => listRoleOptions(input.restaurantId),
);

export const createRestaurantUserAction = platformAction({ schema: createPlatformUserSchema }, async (input) => {
  const { restaurantId, ...body } = input;
  return backend.post<{ memberId: string; attachedExisting: boolean }>(`${admin}/restaurants/${restaurantId}/members`, body);
});

export const updateRestaurantMemberAction = platformAction({ schema: adminUpdateMemberSchema }, async (input) => {
  await backend.put(`${admin}/restaurants/${input.restaurantId}/members/${input.memberId}`, { roleId: input.roleId, status: input.status });
  return { ok: true };
});

export const setRestaurantMemberPermissionsAction = platformAction({ schema: adminMemberPermissionsSchema }, async (input) => {
  await backend.put(`${admin}/restaurants/${input.restaurantId}/members/${input.memberId}/permissions`, { permissions: input.permissions });
  return { ok: true };
});

export const resetRestaurantMemberPasswordAction = platformAction({ schema: adminResetPasswordSchema }, async (input) => {
  await backend.post(`${admin}/restaurants/${input.restaurantId}/members/${input.memberId}/reset-password`, { password: input.password });
  return { ok: true };
});

export const removeRestaurantMemberAction = platformAction({ schema: adminMemberRefSchema }, async (input) => {
  await backend.delete(`${admin}/restaurants/${input.restaurantId}/members/${input.memberId}`);
  return { ok: true };
});

/** Disable or re-enable a person's sign-in across every restaurant. */
export const setUserStatusAction = platformAction({ schema: userStatusSchema }, async (input) => {
  await backend.put(`${admin}/users/${input.userId}/status`, { status: input.status });
  return { ok: true };
});

// ─── Plans & platform settings ──────────────────────────────────────────────

export const savePlanAction = platformAction({ schema: planSchema }, async (input) => {
  const { id, ...body } = input;
  return id ? backend.put<{ id: string }>(`${admin}/plans/${id}`, body) : backend.post<{ id: string }>(`${admin}/plans`, body);
});

export const deletePlanAction = platformAction({ schema: planIdSchema }, async (input) => {
  await backend.delete(`${admin}/plans/${input.id}`);
  return { ok: true };
});

export const savePlatformSettingsAction = platformAction({ schema: platformSettingsSchema }, async (input) => {
  await backend.put(`${admin}/settings`, input);
  return { ok: true };
});

// ─── Demo requests ──────────────────────────────────────────────────────────

export const updateDemoAction = platformAction({ schema: updateDemoSchema }, async (input, ctx) => updateDemoRequest(ctx, input));

export const setDemoStatusAction = platformAction({ schema: demoStatusSchema }, async (input, ctx) => setDemoStatus(ctx, input.id, input.status));

export const deleteDemoAction = platformAction({ schema: demoIdSchema }, async (input, ctx) => {
  await deleteDemoRequest(ctx, input.id);
  return { ok: true };
});

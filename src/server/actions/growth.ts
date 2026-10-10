"use server";

import { z } from "zod";
import { integrationCredentialsSchema, integrationSettingsSchema, loyaltyProgramSchema } from "@/lib/validation/inventory";
import { restaurantAction } from "../action";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import {
  disconnectIntegration,
  importExternalOrder,
  rejectExternalOrder,
  saveCredentials,
  saveIntegrationSettings,
  sendSandboxOrder,
  testIntegration,
} from "../services/integrations";
import { runLoyaltyMaintenance } from "../services/loyalty";

const providerSchema = z.object({ provider: z.enum(["SWIGGY", "ZOMATO"]) });

export const saveIntegrationSettingsAction = restaurantAction({ permission: ["swiggy.manage", "zomato.manage"], schema: integrationSettingsSchema }, (input, ctx) =>
  saveIntegrationSettings(ctx, input),
);
export const saveIntegrationCredentialsAction = restaurantAction({ permission: ["swiggy.manage", "zomato.manage"], schema: integrationCredentialsSchema }, (input, ctx) =>
  saveCredentials(ctx, input),
);
export const testIntegrationAction = restaurantAction({ permission: ["swiggy.manage", "zomato.manage"], schema: providerSchema }, (input, ctx) => testIntegration(ctx, input.provider));
export const disconnectIntegrationAction = restaurantAction({ permission: ["swiggy.manage", "zomato.manage"], schema: providerSchema }, (input, ctx) =>
  disconnectIntegration(ctx, input.provider),
);
export const sandboxOrderAction = restaurantAction({ permission: ["swiggy.manage", "zomato.manage"], schema: providerSchema }, (input, ctx) => sendSandboxOrder(ctx, input.provider));
export const acceptExternalOrderAction = restaurantAction({ permission: ["swiggy.manage", "zomato.manage"], schema: z.object({ id: z.string().min(1) }) }, async (input, ctx) => {
  const ext = await ctx.db.externalOrder.findUnique({ where: { id: input.id } });
  if (ext) assertPermission(ctx, ext.provider === "SWIGGY" ? "swiggy.manage" : "zomato.manage");
  return importExternalOrder(ctx, input.id);
});
export const rejectExternalOrderAction = restaurantAction(
  { permission: ["swiggy.manage", "zomato.manage"], schema: z.object({ id: z.string().min(1), reason: z.string().trim().min(1).max(200) }) },
  (input, ctx) => rejectExternalOrder(ctx, input.id, input.reason),
);

export const saveLoyaltyProgramAction = restaurantAction({ permission: "loyalty.manage", schema: loyaltyProgramSchema }, async (input, ctx) => {
  await ctx.db.loyaltyProgram.upsert({
    where: { restaurantId: ctx.restaurantId },
    create: { restaurantId: ctx.restaurantId, ...input },
    update: input,
  });
  await audit(ctx, { action: "loyalty.program_updated", entity: "LoyaltyProgram", summary: `${ctx.actor.name} updated the loyalty programme (${input.pointsPerHundred} pts per ₹100)` });
});
export const runLoyaltyMaintenanceAction = restaurantAction({ permission: "loyalty.manage", schema: z.object({}) }, (_input, ctx) => runLoyaltyMaintenance(ctx));

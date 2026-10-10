"use server";

import { demoInstant } from "@/lib/demo";
import { demoAvailabilitySchema, demoRequestSchema } from "@/lib/validation/demo";
import { publicAction } from "../action";
import { getRequestMeta } from "../auth/context";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import { createDemoRequest, demoAvailability } from "../services/demos";

/** Public: book a demo from the landing page. */
export const requestDemoAction = publicAction(demoRequestSchema, async (input) => {
  const meta = await getRequestMeta();
  await enforceRateLimit(`demo:${meta.ip}`, RATE_LIMITS.demoRequest);
  // Honeypot: bots fill every field. Look successful, store nothing.
  if (input.website) return { id: "received", scheduledAt: demoInstant(input.date, input.time).toISOString() };
  const { website: _honeypot, ...booking } = input;
  return createDemoRequest(booking, meta);
});

/** Public: refresh slot availability (e.g. after a slot was taken). */
export const demoAvailabilityAction = publicAction(demoAvailabilitySchema, async () => {
  const meta = await getRequestMeta();
  await enforceRateLimit(`demo-slots:${meta.ip}`, RATE_LIMITS.demoAvailability);
  return demoAvailability();
});

import { createHmac } from "node:crypto";
import { safeEqual } from "../crypto";
import { ValidationError } from "../errors";
import { aggregatorEnvelopeSchema, type AggregatorAdapter, type AggregatorEnvelope } from "./types";

/**
 * Partner adapters.
 *
 * Swiggy and Zomato only expose order APIs to approved partners, under
 * agreements that define their payload formats. Until those credentials and
 * specs are available, both adapters:
 *   • accept the documented Tabla envelope on the webhook (e.g. via an
 *     aggregator middleware), and
 *   • report connection status honestly — never "Connected" without a real
 *     partner handshake.
 * Implement `normalise` / `testConnection` / `acceptOrder` against the partner
 * spec when onboarding.
 */
function envelopeOrThrow(payload: unknown, provider: string): AggregatorEnvelope {
  const parsed = aggregatorEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(`Unrecognised ${provider} payload — send the Tabla aggregator envelope (see README › Integrations)`);
  }
  return parsed.data;
}

function partnerPending(name: string) {
  return async () => ({
    ok: false,
    status: "PENDING" as const,
    message: `Credentials saved securely. Live ${name} API access is enabled once your partner onboarding is approved — orders can already arrive via the webhook.`,
  });
}

export const ADAPTERS: Record<"SWIGGY" | "ZOMATO", AggregatorAdapter> = {
  SWIGGY: {
    provider: "SWIGGY",
    displayName: "Swiggy",
    docsUrl: "https://partner.swiggy.com",
    normalise: (payload) => envelopeOrThrow(payload, "Swiggy"),
    testConnection: partnerPending("Swiggy"),
  },
  ZOMATO: {
    provider: "ZOMATO",
    displayName: "Zomato",
    docsUrl: "https://www.zomato.com/partners/onlineordering",
    normalise: (payload) => envelopeOrThrow(payload, "Zomato"),
    testConnection: partnerPending("Zomato"),
  },
};

/** HMAC-SHA256 hex signature over the raw request body. */
export function signPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  return safeEqual(signPayload(rawBody, secret), signature.replace(/^sha256=/, ""));
}

import { prisma } from "@/server/db";
import { errorResponse, json } from "@/server/api/handler";
import { systemContext } from "@/server/auth/load-context";
import { decryptJson } from "@/server/crypto";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/errors";
import { ADAPTERS, verifySignature } from "@/server/integrations/adapters";
import type { IntegrationCredentials } from "@/server/integrations/types";
import { enforceRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { ingestExternalOrder } from "@/server/services/integrations";

/**
 * Aggregator order webhook.
 *   POST /api/v1/integrations/{swiggy|zomato}/webhook?restaurant={slug}
 *   Header: X-Tabla-Signature: hex(HMAC-SHA256(rawBody, webhookSecret))
 *   Body:   partner payload (adapter-normalised) or the Tabla envelope
 * Responses are idempotent on the platform order id.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = (await params).provider.toUpperCase();
    if (provider !== "SWIGGY" && provider !== "ZOMATO") throw new NotFoundError("Integration");
    const slug = new URL(req.url).searchParams.get("restaurant");
    if (!slug) throw new NotFoundError("Restaurant");
    await enforceRateLimit(`webhook:${provider}:${slug}`, RATE_LIMITS.webhook);

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, include: { modules: true } });
    if (!restaurant || restaurant.status !== "ACTIVE") throw new NotFoundError("Restaurant");
    if (!restaurant.modules.some((m) => m.moduleKey === provider.toLowerCase() && m.enabled)) throw new ForbiddenError("Integration not enabled for this restaurant");

    const integration = await prisma.integration.findUnique({
      where: { restaurantId_provider: { restaurantId: restaurant.id, provider } },
      include: { credential: true },
    });
    if (!integration?.credential) throw new UnauthorizedError("Integration has no credentials configured");

    const raw = await req.text();
    const creds = decryptJson<IntegrationCredentials>(integration.credential.encryptedPayload);
    if (!verifySignature(raw, req.headers.get("x-tabla-signature"), creds.webhookSecret)) throw new UnauthorizedError("Invalid signature");

    const envelope = ADAPTERS[provider].normalise(JSON.parse(raw));
    const ctx = systemContext(restaurant.id, `${ADAPTERS[provider].displayName} webhook`);
    const result = await ingestExternalOrder(ctx, provider, envelope);
    return json(result, result.duplicate ? 200 : 202);
  } catch (error) {
    return errorResponse(error);
  }
}

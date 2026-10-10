import { z } from "zod";

/**
 * Tabla aggregator envelope — the canonical shape every external channel is
 * normalised into before entering the unified order pipeline. Adapters map a
 * partner's native payload to this; middleware (UrbanPiper, a custom bridge…)
 * can also post it directly to the webhook.
 */
export const aggregatorEnvelopeSchema = z.object({
  orderId: z.string().min(1).max(80),
  placedAt: z.string().datetime().optional(),
  customer: z.object({ name: z.string().min(1).max(80), phone: z.string().max(20).optional().nullable() }),
  fulfilment: z.enum(["DELIVERY", "PICKUP"]).default("DELIVERY"),
  deliveryAddress: z.string().max(300).optional().nullable(),
  items: z
    .array(
      z.object({
        sku: z.string().max(40).optional().nullable(),
        name: z.string().max(120),
        quantity: z.number().int().min(1).max(100),
        /** Platform price in minor units (informational; menu prices apply). */
        price: z.number().int().min(0).optional(),
        notes: z.string().max(200).optional().nullable(),
      }),
    )
    .min(1),
  payment: z.object({ mode: z.enum(["PREPAID", "COD"]), amount: z.number().int().min(0) }),
  instructions: z.string().max(300).optional().nullable(),
});

export type AggregatorEnvelope = z.infer<typeof aggregatorEnvelopeSchema>;

export interface IntegrationCredentials {
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
}

export interface ConnectionResult {
  ok: boolean;
  status: "CONNECTED" | "PENDING" | "ERROR";
  message: string;
}

/** One implementation per aggregator. Live calls need partner API access. */
export interface AggregatorAdapter {
  provider: "SWIGGY" | "ZOMATO";
  displayName: string;
  docsUrl: string;
  /** Turn the partner's native webhook body into the Tabla envelope. */
  normalise(payload: unknown): AggregatorEnvelope;
  /** Verify credentials against the partner API. */
  testConnection(creds: IntegrationCredentials, storeId: string | null): Promise<ConnectionResult>;
  /** Partner operations — wired once partner access exists. */
  acceptOrder?(creds: IntegrationCredentials, externalId: string): Promise<void>;
  rejectOrder?(creds: IntegrationCredentials, externalId: string, reason: string): Promise<void>;
  pushMenu?(creds: IntegrationCredentials, storeId: string, items: { sku: string; name: string; price: number; available: boolean }[]): Promise<void>;
}

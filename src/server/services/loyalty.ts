import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";

export async function adjustPoints(_ctx: ServiceContext, input: { customerId: string; points: number; reason: string }) {
  return backend.post<{ balance: number }>("/api/v1/loyalty/adjust", input);
}

export async function runLoyaltyMaintenance(_ctx: ServiceContext) {
  return backend.post<{ expired: number; birthdays: number }>("/api/v1/loyalty/maintenance");
}

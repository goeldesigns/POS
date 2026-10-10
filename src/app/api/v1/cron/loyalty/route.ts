import { prisma } from "@/server/db";
import { errorResponse, json } from "@/server/api/handler";
import { systemContext } from "@/server/auth/load-context";
import { safeEqual } from "@/server/crypto";
import { UnauthorizedError } from "@/server/errors";
import { runLoyaltyMaintenance } from "@/server/services/loyalty";

/**
 * Daily job: expire lapsed points and grant birthday bonuses for every active
 * restaurant with loyalty enabled. Call from your scheduler with
 *   Authorization: Bearer $CRON_SECRET
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "";
    if (!secret || !safeEqual(auth, secret)) throw new UnauthorizedError();
    const restaurants = await prisma.restaurant.findMany({
      where: { status: "ACTIVE", deletedAt: null, modules: { some: { moduleKey: "loyalty", enabled: true } } },
      select: { id: true, name: true },
    });
    const results = [];
    for (const r of restaurants) {
      results.push({ restaurant: r.name, ...(await runLoyaltyMaintenance(systemContext(r.id, "Loyalty job"))) });
    }
    return json({ processed: results.length, results });
  } catch (error) {
    return errorResponse(error);
  }
}

import { tenantRoute } from "@/server/api/handler";
import { getNotifications } from "@/server/services/notifications";

export const GET = tenantRoute({}, async (_req, ctx) => getNotifications(ctx));

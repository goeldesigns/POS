import { redirect } from "next/navigation";
import { requireRestaurantSession } from "@/server/auth/guards";

export default async function SettingsIndex() {
  const ctx = await requireRestaurantSession();
  redirect(ctx.permissions.has("settings.view") ? "/app/settings/profile" : "/app/profile");
}

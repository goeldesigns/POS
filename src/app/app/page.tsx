import { redirect } from "next/navigation";
import { homeFor } from "@/lib/nav";
import { requireRestaurantSession } from "@/server/auth/guards";

export default async function AppIndex() {
  const ctx = await requireRestaurantSession();
  redirect(homeFor(ctx));
}

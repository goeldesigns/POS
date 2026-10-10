import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RestaurantPicker } from "@/components/auth/restaurant-picker";
import { listMyRestaurants } from "@/server/actions/auth";
import { getRestaurantContext } from "@/server/auth/context";
import { param, type SearchParams } from "@/server/list-params";

export const metadata: Metadata = { title: "Choose restaurant" };

export default async function SelectRestaurantPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getRestaurantContext();
  if (!ctx) redirect("/auth/login");
  const restaurants = await listMyRestaurants();
  const next = param(await searchParams, "next");
  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Choose a restaurant</h1>
      <p className="mt-1 text-[13px] text-muted">
        Signed in as {ctx.user.name}. You have access to {restaurants.length} restaurants — you can switch any time from the top bar.
      </p>
      <RestaurantPicker restaurants={restaurants} next={next?.startsWith("/app") ? next : "/app"} />
    </div>
  );
}

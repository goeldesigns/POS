import { Ban, LogOut } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { SessionProvider } from "@/components/shell/session-context";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { formatDate } from "@/lib/format";
import { navFor } from "@/lib/nav";
import { backend } from "@/server/backend/client";
import { listMyRestaurants, logoutAction } from "@/server/actions/auth";
import { requireRestaurantSession } from "@/server/auth/guards";
import { RestaurantPicker } from "@/components/auth/restaurant-picker";

interface Subscription {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  usage: { key: string; used: number; limit: number | null }[];
}

export default async function RestaurantAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRestaurantSession();
  const restaurants = await listMyRestaurants();

  if (ctx.restaurant.status === "SUSPENDED") {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-4">
        <div className="w-full max-w-[460px] rounded-2xl border border-line bg-surface p-7 shadow-card">
          <Logo subtitle={ctx.restaurant.name} />
          <div className="mt-6 grid size-11 place-items-center rounded-xl bg-danger-50 text-danger">
            <Ban className="size-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-ink">This account is suspended</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {ctx.restaurant.name} was suspended{ctx.restaurant.suspendedAt ? ` on ${formatDate(ctx.restaurant.suspendedAt, ctx.restaurant.timezone)}` : ""}.
            {ctx.restaurant.suspendReason ? ` Reason: ${ctx.restaurant.suspendReason}.` : ""} Your data is safe. Contact {BRAND.supportEmail} to restore access.
          </p>
          {restaurants.length > 1 ? <RestaurantPicker restaurants={restaurants.filter((x) => !x.current)} next="/app" /> : null}
          <form action={logoutAction} className="mt-6">
            <Button type="submit" variant="outline" className="w-full">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
      </div>
    );
  }

  let planCard: { plan: string; detail: string; usage?: string } | null = null;
  if (ctx.membership.isOwner || ctx.permissions.has("settings.edit")) {
    const sub = await backend.get<Subscription>("/api/v1/settings/subscription");
    const users = sub.usage.find((u) => u.key === "users");
    const end = formatDate(new Date(sub.currentPeriodEnd), ctx.restaurant.timezone);
    planCard = {
      plan: sub.plan,
      detail: sub.status === "TRIALING" ? `Trial ends ${end}` : sub.status === "PAST_DUE" ? "Payment overdue — update billing" : `Renews ${end}`,
      usage: users?.limit ? `${users.used} of ${users.limit} user seats used` : `${users?.used ?? 0} users · unlimited seats`,
    };
  }

  const platform = await backend.get<{ maintenanceBanner: string }>("/api/v1/public/platform");
  const banner = platform.maintenanceBanner.trim() || null;

  return (
    <SessionProvider
      value={{
        user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl },
        restaurant: {
          id: ctx.restaurant.id,
          name: ctx.restaurant.name,
          city: ctx.restaurant.city,
          currency: ctx.restaurant.currency,
          timezone: ctx.restaurant.timezone,
          locale: ctx.restaurant.locale,
          status: ctx.restaurant.status,
        },
        role: ctx.membership.roleName,
        isOwner: ctx.membership.isOwner,
        permissions: [...ctx.permissions],
        modules: [...ctx.modules],
        plan: ctx.plan ? { key: ctx.plan.key, name: ctx.plan.name } : null,
      }}
    >
      <AppShell nav={navFor(ctx)} restaurants={restaurants} planCard={planCard} banner={banner}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}

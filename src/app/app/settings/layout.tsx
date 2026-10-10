import { SettingsNav, type SettingsNavGroup } from "@/components/settings/settings-nav";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { requireRestaurantSession } from "@/server/auth/guards";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRestaurantSession();
  const canView = ctx.permissions.has("settings.view");
  const groups: SettingsNavGroup[] = canView
    ? [
        {
          label: "Restaurant",
          items: [
            { slug: "profile", label: "Restaurant profile" },
            { slug: "business", label: "Business information" },
            { slug: "tax", label: "Tax & charges" },
            { slug: "receipt", label: "Receipt" },
            { slug: "invoice", label: "Invoice & numbering" },
          ],
        },
        {
          label: "Operations",
          items: [
            { slug: "payment", label: "Payments" },
            { slug: "orders", label: "Order settings" },
            { slug: "pos", label: "POS settings" },
            { slug: "printers", label: "Printers" },
            { slug: "kitchen", label: "Kitchen" },
            { slug: "tables", label: "Tables" },
            { slug: "reservations", label: "Reservations" },
            { slug: "notifications", label: "Notifications" },
          ],
        },
        {
          label: "Team & access",
          items: [
            { slug: "users", label: "Users" },
            { slug: "roles", label: "Roles & permissions" },
          ],
        },
        {
          label: "Growth",
          items: [
            { slug: "coupons", label: "Discounts & coupons" },
            ...(ctx.modules.has("loyalty") ? [{ slug: "loyalty", label: "Loyalty", href: "/app/loyalty" }] : []),
            { slug: "integrations", label: "Integrations & API" },
          ],
        },
        {
          label: "Account",
          items: [
            { slug: "security", label: "Security" },
            { slug: "subscription", label: "Subscription" },
            { slug: "me", label: "My profile", href: "/app/profile" },
          ],
        },
      ]
    : [{ label: "Account", items: [{ slug: "me", label: "My profile", href: "/app/profile" }] }];

  return (
    <Page>
      <PageHeader title="Settings" description={`Configuration for ${ctx.restaurant.name}`} />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav groups={groups} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Page>
  );
}

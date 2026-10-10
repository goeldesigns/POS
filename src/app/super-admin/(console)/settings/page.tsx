import type { Metadata } from "next";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { requirePlatformSession } from "@/server/auth/guards";
import { getPlatformSettings, listPlans } from "@/server/services/platform";

export const metadata: Metadata = { title: "Settings" };

export default async function PlatformSettingsPage() {
  await requirePlatformSession();
  const [settings, plans] = await Promise.all([getPlatformSettings(), listPlans()]);
  return (
    <Page className="max-w-[1080px]">
      <PageHeader title="Settings" description="Platform-wide configuration. Every change is recorded in the audit log." />
      <PlatformSettingsForm value={settings} plans={plans.filter((p) => p.isActive).map((p) => ({ key: p.key, name: p.name }))} />
    </Page>
  );
}

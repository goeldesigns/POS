import type { Metadata } from "next";
import { ProfileForms } from "@/components/settings/profile-forms";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { changeAdminPasswordAction, updateAdminProfileAction } from "@/server/actions/auth";
import { requirePlatformSession } from "@/server/auth/guards";

export const metadata: Metadata = { title: "My profile" };

export default async function AdminProfilePage() {
  const ctx = await requirePlatformSession();
  return (
    <Page>
      <PageHeader title="My profile" description={`${ctx.user.platformRole === "SUPER_ADMIN" ? "Super Admin" : "Support"} · platform console`} />
      <ProfileForms
        name={ctx.user.name}
        email={ctx.user.email}
        phone={ctx.user.phone}
        profileAction={updateAdminProfileAction}
        passwordAction={changeAdminPasswordAction}
      />
    </Page>
  );
}

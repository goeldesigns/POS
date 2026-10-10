import type { Metadata } from "next";
import { ProfileForms } from "@/components/settings/profile-forms";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui/page-header";
import { changeAdminPasswordAction, updateAdminProfileAction } from "@/server/actions/auth";
import { requirePlatformSession } from "@/server/auth/guards";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "My profile" };

export default async function AdminProfilePage() {
  const ctx = await requirePlatformSession();
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { phone: true } });
  return (
    <Page>
      <PageHeader title="My profile" description={`${ctx.user.platformRole === "SUPER_ADMIN" ? "Super Admin" : "Support"} · platform console`} />
      <ProfileForms
        name={ctx.user.name}
        email={ctx.user.email}
        phone={user?.phone ?? null}
        profileAction={updateAdminProfileAction}
        passwordAction={changeAdminPasswordAction}
      />
    </Page>
  );
}

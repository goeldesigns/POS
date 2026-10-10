import type { Metadata } from "next";
import { Page } from "@/components/shell/page";
import { ProfileForms } from "@/components/settings/profile-forms";
import { PageHeader } from "@/components/ui/page-header";
import { changePasswordAction, updateProfileAction } from "@/server/actions/auth";
import { requireRestaurantSession } from "@/server/auth/guards";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await requireRestaurantSession();
  return (
    <Page>
      <PageHeader title="My profile" description={`${ctx.membership.roleName} at ${ctx.restaurant.name}`} />
      <ProfileForms name={ctx.user.name} email={ctx.user.email} phone={ctx.user.phone} profileAction={updateProfileAction} passwordAction={changePasswordAction} />
    </Page>
  );
}

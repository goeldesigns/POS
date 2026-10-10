import { AdminShell } from "@/components/admin/admin-shell";
import { SUPER_ADMIN_NAV } from "@/lib/nav";
import { requirePlatformSession } from "@/server/auth/guards";
import { demoInbox } from "@/server/services/demos";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformSession();
  const inbox = await demoInbox();
  const nav = SUPER_ADMIN_NAV.map((item) => (item.href === "/super-admin/demos" ? { ...item, badge: inbox.fresh } : item));
  const environment = process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "Production" : "Development");
  return (
    <AdminShell
      user={{
        name: ctx.user.name,
        email: ctx.user.email,
        avatarUrl: ctx.user.avatarUrl,
        role: ctx.user.platformRole === "SUPER_ADMIN" ? "Super Admin" : "Support",
      }}
      nav={nav}
      environment={environment}
    >
      {children}
    </AdminShell>
  );
}

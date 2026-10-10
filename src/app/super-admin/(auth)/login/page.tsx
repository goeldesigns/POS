import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/auth-forms";
import { getPlatformContext } from "@/server/auth/context";
import { param, type SearchParams } from "@/server/list-params";

export const metadata: Metadata = { title: "Platform console" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  if (await getPlatformContext()) redirect("/super-admin/dashboard");
  const showDemo = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";
  return (
    <LoginForm
      variant="admin"
      next={param(sp, "next")}
      demoAccounts={showDemo ? [{ label: "Super Admin", email: "admin@tabla.dev", password: "Admin@12345" }] : undefined}
    />
  );
}

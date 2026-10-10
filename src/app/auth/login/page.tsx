import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";
import { param, type SearchParams } from "@/server/list-params";

export const metadata: Metadata = { title: "Sign in" };

const DEMO = [
  { label: "Owner · Spice & Stone", email: "owner@spiceandstone.demo", password: "Demo@1234" },
  { label: "Manager · 2 restaurants", email: "manager@spiceandstone.demo", password: "Demo@1234" },
  { label: "Cashier", email: "cashier@spiceandstone.demo", password: "Demo@1234" },
  { label: "Kitchen staff", email: "kitchen@spiceandstone.demo", password: "Demo@1234" },
  { label: "Owner · Starter plan", email: "owner@coastalcurry.demo", password: "Demo@1234" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  // Always ask for credentials — even if this browser still holds a session.
  const showDemo = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";
  return (
    <LoginForm
      next={param(sp, "next")}
      demoAccounts={showDemo ? DEMO : undefined}
      notice={param(sp, "reset") ? "Password updated. Sign in with your new password." : undefined}
    />
  );
}

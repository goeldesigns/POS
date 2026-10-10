import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { InlineAlert } from "@/components/ui/display";
import { param, type SearchParams } from "@/server/list-params";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const token = param(await searchParams, "token");
  if (!token) {
    return (
      <div>
        <h1 className="text-[22px] font-semibold text-ink">Reset link missing</h1>
        <InlineAlert tone="warning" className="mt-5">
          Open the link from your email, or{" "}
          <Link href="/auth/forgot-password" className="font-semibold underline">
            request a new one
          </Link>
          .
        </InlineAlert>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}

import { Lock } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { homeFor } from "@/lib/nav";
import { isPermissionKey, MODULE_CATALOG, moduleOf } from "@/lib/permissions/catalog";
import { requireRestaurantSession } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireRestaurantSession();
  const required = param(await searchParams, "required") ?? "";
  const module = isPermissionKey(required) ? moduleOf(required) : null;
  const moduleDisabled = module ? !ctx.modules.has(module) : false;
  const label = module ? MODULE_CATALOG[module].label : "this page";

  return (
    <Page>
      <Card className="mx-auto mt-10 max-w-[520px] p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-sunken text-muted">
          <Lock className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink">You don&apos;t have access to {label}</h1>
        <p className="mx-auto mt-1.5 max-w-[400px] text-[13px] leading-relaxed text-muted">
          {moduleDisabled
            ? `${label} isn't included in ${ctx.restaurant.name}'s current plan. The account owner can request it from Tabla support.`
            : `Your role (${ctx.membership.roleName}) doesn't include this permission. Ask your manager or the restaurant owner to update your access.`}
        </p>
        <Button asChild className="mt-6">
          <Link href={homeFor(ctx)}>Go to my workspace</Link>
        </Button>
      </Card>
    </Page>
  );
}

import type { Metadata } from "next";
import { PosScreen } from "@/components/pos/pos-screen";
import { Page } from "@/components/shell/page";
import { InlineAlert } from "@/components/ui/display";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { getCouponByCode, getCustomerForPos, getOrderForPos, getPosBootstrap, type PosOrder } from "@/server/services/pos";

export const metadata: Metadata = { title: "POS" };

export default async function PosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("pos.view");
  const sp = await searchParams;
  const orderId = param(sp, "order");
  const tableId = param(sp, "table");
  const customerId = param(sp, "customer");

  const data = await getPosBootstrap(ctx);
  let order: PosOrder | null = null;
  let error: string | null = null;
  if (orderId) {
    try {
      order = await getOrderForPos(ctx, orderId);
      if (!order.open) {
        error = `${order.orderNumber} is ${order.status.toLowerCase()} and can't be edited here. Open it from Orders to refund or reprint.`;
        order = null;
      }
    } catch {
      error = "That order couldn't be found.";
    }
  }
  let coupon = null;
  if (order?.couponCode) {
    coupon = await getCouponByCode(ctx, order.couponCode);
  }

  let initialCustomer = null;
  if (!order && customerId) {
    initialCustomer = await getCustomerForPos(ctx, customerId);
  }

  return (
    <>
      {error ? (
        <Page className="pb-0">
          <InlineAlert tone="warning">{error}</InlineAlert>
        </Page>
      ) : null}
      <PosScreen
        key={order?.id ?? tableId ?? customerId ?? "new"}
        data={data}
        initialOrder={order}
        initialCoupon={coupon}
        initialTableId={tableId ?? null}
        initialCustomer={initialCustomer}
      />
    </>
  );
}

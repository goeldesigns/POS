import type { Metadata } from "next";
import { AutoPrint } from "@/components/print/auto-print";
import { formatTime } from "@/lib/format";
import { ORDER_SOURCE_LABEL, ORDER_TYPE_LABEL } from "@/lib/labels";
import { groupBy } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { getPrintData } from "@/server/services/print-data";

export const metadata: Metadata = { title: "Kitchen ticket" };

/** Kitchen Order Ticket — one section per kitchen station. */
export default async function KotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission(["orders.view", "pos.view"]);
  const { id } = await params;
  const auto = param(await searchParams, "auto") !== "0";
  const { order: o, restaurant: r } = await getPrintData(ctx, id);
  const stations = groupBy(o.items, (i) => i.kitchenStation ?? "Kitchen");

  return (
    <>
      <AutoPrint auto={auto} />
      <div className="mx-auto w-[80mm] space-y-3 print:space-y-0">
        {Object.entries(stations).map(([station, items]) => (
          <article key={station} className="break-after-page bg-white px-3 py-4 font-mono text-[12px] leading-[1.4] text-black shadow-card print:shadow-none">
            <div className="flex items-baseline justify-between">
              <h1 className="text-[18px] font-bold">KOT</h1>
              <span className="text-[13px] font-bold">{station.toUpperCase()}</span>
            </div>
            <p className="text-[16px] font-bold">{o.table ? `TABLE ${o.table.name}` : ORDER_TYPE_LABEL[o.type].toUpperCase()}</p>
            <p>
              {o.orderNumber} · {formatTime(o.placedAt ?? o.createdAt, r.timezone)}
              {o.source !== "POS" ? ` · ${ORDER_SOURCE_LABEL[o.source]}` : ""}
            </p>
            {o.createdBy ? <p>By: {o.createdBy}{o.guests ? ` · Guests: ${o.guests}` : ""}</p> : null}
            <div className="my-2 border-t border-dashed border-black" />
            <ul className="space-y-1.5">
              {items.map((i) => (
                <li key={i.id}>
                  <p className="text-[14px] font-bold">
                    {i.quantity} × {i.name}
                    {i.variantName ? ` (${i.variantName})` : ""}
                  </p>
                  {i.modifiers.length ? <p className="pl-5">+ {i.modifiers.map((m) => m.name).join(", ")}</p> : null}
                  {i.notes ? <p className="pl-5 font-bold">** {i.notes} **</p> : null}
                </li>
              ))}
            </ul>
            {o.notes ? (
              <>
                <div className="my-2 border-t border-dashed border-black" />
                <p className="font-bold">NOTE: {o.notes}</p>
              </>
            ) : null}
            <div className="my-2 border-t border-dashed border-black" />
            <p className="text-center text-[10px]">{items.reduce((a, i) => a + i.quantity, 0)} items · {r.name}</p>
          </article>
        ))}
      </div>
    </>
  );
}

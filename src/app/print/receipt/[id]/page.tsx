import type { Metadata } from "next";
import { AutoPrint } from "@/components/print/auto-print";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { getPrintData } from "@/server/services/print-data";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission(["orders.view", "pos.view"]);
  const { id } = await params;
  const auto = param(await searchParams, "auto") !== "0";
  const { order: o, restaurant: r, settings: s } = await getPrintData(ctx, id);
  const tz = r.timezone;
  const width = s.receiptPaperWidth === 58 ? "w-[58mm]" : "w-[80mm]";
  const india = r.currency === "INR";
  const payments = o.payments.filter((p) => p.kind === "PAYMENT");
  const refunds = o.payments.filter((p) => p.kind === "REFUND");
  const change = payments.reduce((a, p) => a + (p.changeAmount ?? 0), 0);

  return (
    <>
      <AutoPrint auto={auto} />
      <article className={`mx-auto ${width} bg-white px-3 py-4 font-mono text-[11px] leading-[1.45] text-black shadow-card print:shadow-none`}>
        <header className="text-center">
          <h1 className="text-[15px] font-bold tracking-wide">{r.name.toUpperCase()}</h1>
          {r.legalName ? <p>{r.legalName}</p> : null}
          {r.addressLine ? <p>{r.addressLine}</p> : null}
          <p>{[r.city, r.state, r.postalCode].filter(Boolean).join(", ")}</p>
          <p>Ph: {r.phone}</p>
          {s.receiptShowGstin && r.gstNumber ? <p>GSTIN: {r.gstNumber}</p> : null}
          {s.receiptShowFssai && r.fssaiNumber ? <p>FSSAI: {r.fssaiNumber}</p> : null}
          {s.receiptHeader ? <p className="mt-1">{s.receiptHeader}</p> : null}
        </header>

        <Rule />
        <p className="text-center font-bold">{india && r.gstNumber ? "TAX INVOICE" : "RECEIPT"}</p>
        <div className="mt-1 grid grid-cols-2 gap-x-2">
          <span>Bill: {s.invoicePrefix}-{o.number}</span>
          <span className="text-right">{formatDate(o.createdAt, tz)}</span>
          <span>Order: {o.orderNumber}</span>
          <span className="text-right">{formatTime(o.createdAt, tz)}</span>
          <span>{ORDER_TYPE_LABEL[o.type]}{o.table ? ` · ${o.table.name}` : ""}</span>
          <span className="text-right">{o.guests ? `Guests: ${o.guests}` : ""}</span>
          {o.createdBy ? <span className="col-span-2">Served by: {o.createdBy.name}</span> : null}
          {o.customerName ? <span className="col-span-2">Customer: {o.customerName}{o.customerPhone ? ` (${o.customerPhone.slice(-4).padStart(o.customerPhone.length, "•")})` : ""}</span> : null}
        </div>

        <Rule />
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th className="font-bold">Item</th>
              <th className="w-8 text-right font-bold">Qty</th>
              <th className="w-14 text-right font-bold">Rate</th>
              <th className="w-16 text-right font-bold">Amt</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="pr-1">
                  {i.name}
                  {i.variantName ? ` (${i.variantName})` : ""}
                  {i.modifiers.length ? <span className="block pl-2">+ {i.modifiers.map((m) => m.name).join(", ")}</span> : null}
                </td>
                <td className="text-right">{i.quantity}</td>
                <td className="text-right">{(i.unitPrice + i.modifiersTotal) / 100}</td>
                <td className="text-right">{(((i.unitPrice + i.modifiersTotal) * i.quantity) / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Rule />
        <Row label={`Subtotal (${o.items.reduce((a, i) => a + i.quantity, 0)} items)`} value={money(o.subtotal)} />
        {o.discounts.map((d) => (
          <Row key={d.id} label={d.reason ?? "Discount"} value={`-${money(d.amount)}`} />
        ))}
        {o.taxes.map((t) =>
          india && t.name.startsWith("GST") ? (
            <div key={t.id}>
              <Row label={`CGST @${t.rate / 2}%`} value={money(Math.floor(t.amount / 2))} />
              <Row label={`SGST @${t.rate / 2}%`} value={money(t.amount - Math.floor(t.amount / 2))} />
            </div>
          ) : (
            <Row key={t.id} label={t.name} value={money(t.amount)} />
          ),
        )}
        {o.serviceCharge ? <Row label="Service charge" value={money(o.serviceCharge)} /> : null}
        {o.roundOff ? <Row label="Round off" value={money(o.roundOff)} /> : null}
        <div className="mt-1 flex justify-between border-y border-dashed border-black py-1 text-[13px] font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(o.total, { currency: r.currency, decimals: 2 })}</span>
        </div>

        {payments.length ? (
          <div className="mt-1">
            {payments.map((p) => (
              <Row key={p.id} label={`Paid · ${PAYMENT_METHOD_LABEL[p.method]}${p.reference ? ` (${p.reference})` : ""}`} value={money(p.receivedAmount ?? p.amount)} />
            ))}
            {change ? <Row label="Change" value={money(change)} /> : null}
            {refunds.map((p) => (
              <Row key={p.id} label={`Refunded · ${PAYMENT_METHOD_LABEL[p.method]}`} value={`-${money(p.amount)}`} />
            ))}
            {o.total - o.paidTotal > 0 ? <Row label="Balance due" value={money(o.total - o.paidTotal)} /> : null}
          </div>
        ) : (
          <p className="mt-1 text-center font-bold">** UNPAID — PRE-BILL **</p>
        )}
        {o.loyaltyPointsEarned ? <p className="mt-1 text-center">You earned {o.loyaltyPointsEarned} loyalty points!</p> : null}

        <Rule />
        <footer className="text-center">
          {s.receiptFooter ? <p>{s.receiptFooter}</p> : null}
          <p className="mt-1 text-[9px]">Powered by Tabla POS</p>
        </footer>
      </article>
    </>
  );
}

function money(minor: number) {
  return (minor / 100).toFixed(2);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Rule() {
  return <div className="my-1.5 border-t border-dashed border-black" />;
}

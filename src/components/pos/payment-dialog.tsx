"use client";

import { Banknote, ChefHat, CircleCheck, CreditCard, Mail, MessageCircle, Plus, Printer, ReceiptText, Smartphone, SquareSplitHorizontal, Trash, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { InlineAlert, Kbd } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney, toMinor } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { sendReceiptAction } from "@/server/actions/pos";

type Method = "CASH" | "CARD" | "UPI" | "SPLIT" | "OTHER";
type PayMethod = "CASH" | "CARD" | "UPI" | "WALLET" | "OTHER";

export interface PaymentLine {
  method: PayMethod;
  amount: number;
  receivedAmount?: number | null;
  reference?: string | null;
}

export interface PaymentResult {
  id: string;
  orderNumber: string;
  total: number;
  paidTotal: number;
  change: number;
  paymentStatus: string;
  /** Order status after payment: tells the cashier whether the kitchen has it. */
  status?: string;
}

const METHODS: { value: Method; label: string; icon: React.ElementType; key: string }[] = [
  { value: "CASH", label: "Cash", icon: Banknote, key: "1" },
  { value: "CARD", label: "Card", icon: CreditCard, key: "2" },
  { value: "UPI", label: "UPI", icon: Smartphone, key: "3" },
  { value: "SPLIT", label: "Split", icon: SquareSplitHorizontal, key: "4" },
  { value: "OTHER", label: "Other", icon: Wallet, key: "5" },
];

export function PaymentDialog({
  open,
  onOpenChange,
  amountDue,
  title,
  accept,
  upiId,
  restaurantName,
  customer,
  onConfirm,
  onDone,
  doneLabel = "Start new order",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  amountDue: number;
  title: string;
  accept: { cash: boolean; card: boolean; upi: boolean };
  upiId: string | null;
  restaurantName: string;
  customer: { name: string; phone: string | null; email?: string | null } | null;
  onConfirm: (payments: PaymentLine[]) => Promise<PaymentResult | null>;
  onDone: () => void;
  /** Label of the button that closes the success view ("Start new order" at the POS). */
  doneLabel?: string;
}) {
  const methods = METHODS.filter((m) => (m.value === "CASH" ? accept.cash : m.value === "CARD" ? accept.card : m.value === "UPI" ? accept.upi : true));
  const [method, setMethod] = React.useState<Method>(methods[0]?.value ?? "CASH");
  const [received, setReceived] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [otherMethod, setOtherMethod] = React.useState<"WALLET" | "OTHER">("WALLET");
  const [split, setSplit] = React.useState<{ method: PayMethod; amount: string; reference: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PaymentResult | null>(null);
  const [email, setEmail] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setMethod(methods[0]?.value ?? "CASH");
    setReceived("");
    setReference("");
    setResult(null);
    setEmail(customer?.email ?? "");
    const half = Math.round(amountDue / 200) * 100;
    setSplit([
      { method: "CASH", amount: String(half / 100), reference: "" },
      { method: "UPI", amount: String((amountDue - half) / 100), reference: "" },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const receivedMinor = received ? toMinor(received) : amountDue;
  const change = Math.max(0, receivedMinor - amountDue);
  const splitTotal = split.reduce((s, r) => s + toMinor(r.amount || 0), 0);

  let payments: PaymentLine[] = [];
  let error: string | null = null;
  if (method === "CASH") {
    if (receivedMinor < amountDue) error = `Received is ${formatMoney(amountDue - receivedMinor)} short`;
    payments = [{ method: "CASH", amount: amountDue, receivedAmount: receivedMinor }];
  } else if (method === "CARD" || method === "UPI") {
    payments = [{ method, amount: amountDue, reference: reference.trim() || null }];
  } else if (method === "OTHER") {
    payments = [{ method: otherMethod, amount: amountDue, reference: reference.trim() || null }];
  } else {
    payments = split
      .filter((r) => toMinor(r.amount || 0) > 0)
      .map((r) => ({ method: r.method, amount: toMinor(r.amount), receivedAmount: r.method === "CASH" ? toMinor(r.amount) : null, reference: r.reference.trim() || null }));
    if (splitTotal > amountDue) error = `Split exceeds the bill by ${formatMoney(splitTotal - amountDue)}`;
    else if (payments.length === 0) error = "Enter at least one amount";
  }
  const partial = method === "SPLIT" && !error && splitTotal < amountDue;

  const confirm = async () => {
    if (error || busy) return;
    setBusy(true);
    const r = await onConfirm(payments);
    setBusy(false);
    if (r) setResult(r);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT";
    if (e.key === "Enter" && !result) {
      e.preventDefault();
      void confirm();
    } else if (e.key === "Enter" && result) {
      e.preventDefault();
      onDone();
    } else if (!typing && !result) {
      const m = methods.find((x) => x.key === e.key);
      if (m) setMethod(m.value);
    }
  };

  const sendReceipt = useAction(sendReceiptAction, { success: "Receipt sent" });
  const upiLink = upiId ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restaurantName)}&am=${(amountDue / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(title)}` : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (!busy ? onOpenChange(o) : undefined)}>
      <DialogContent
        title={result ? "Payment complete" : "Take payment"}
        description={result ? undefined : title}
        size="md"
        onKeyDown={onKeyDown}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {result ? (
          <>
            <DialogBody className="space-y-5">
              <div className="flex flex-col items-center py-2 text-center">
                <div className="grid size-14 place-items-center rounded-full bg-success-50 text-success">
                  <CircleCheck className="size-7" />
                </div>
                <p className="mt-3 text-[15px] font-semibold text-ink">
                  {result.paymentStatus === "PAID" ? "Paid in full" : "Partial payment recorded"} · {result.orderNumber}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {formatMoney(result.paidTotal)} received
                  {result.paymentStatus !== "PAID" ? ` · ${formatMoney(result.total - result.paidTotal)} still due` : ""}
                </p>
                {result.status === "NEW" || result.status === "PREPARING" || result.status === "READY" ? (
                  <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-info-50 px-2.5 py-1 text-xs font-medium text-info-700">
                    <ChefHat className="size-3.5" /> {result.status === "NEW" ? "Sent to the kitchen" : "The kitchen is on it"}
                  </p>
                ) : result.status === "COMPLETED" ? (
                  <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
                    <CircleCheck className="size-3.5" /> Order closed
                  </p>
                ) : null}
                {result.change > 0 ? (
                  <div className="mt-4 rounded-xl bg-warning-50 px-5 py-3 ring-1 ring-warning-100">
                    <p className="text-xs text-warning-700">Change to return</p>
                    <p className="text-2xl font-semibold text-ink">{formatMoney(result.change)}</p>
                  </div>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => window.open(`/print/receipt/${result.id}`, "_blank", "width=420,height=720")}>
                  <Printer /> Print receipt
                </Button>
                <Button variant="outline" onClick={() => window.open(`/print/kot/${result.id}`, "_blank", "width=420,height=720")}>
                  <ReceiptText /> Print KOT
                </Button>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 text-[13px] font-medium text-ink">Send receipt</p>
                <div className="flex gap-2">
                  <Input className="flex-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" prefix={<Mail />} />
                  <Button variant="secondary" loading={sendReceipt.pending} disabled={!email.includes("@")} onClick={() => sendReceipt.execute({ orderId: result.id, email })}>
                    Email
                  </Button>
                </div>
                {customer?.phone ? (
                  <a
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-500 hover:text-brand-600"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/${customer.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(
                      `Thank you for visiting ${restaurantName}! Your bill ${result.orderNumber} for ${formatMoney(result.total)} is paid.`,
                    )}`}
                  >
                    <MessageCircle className="size-3.5" /> Share on WhatsApp with {customer.name.split(" ")[0]}
                  </a>
                ) : null}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button size="lg" className="w-full sm:w-auto" onClick={onDone}>
                {doneLabel} <Kbd className="border-white/30 bg-white/15 text-white">Enter</Kbd>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="space-y-5">
              <div className="rounded-xl bg-canvas px-4 py-3 text-center">
                <p className="text-xs text-muted">Amount due</p>
                <p className="text-[28px] leading-tight font-semibold tracking-[-0.01em] text-ink">{formatMoney(amountDue)}</p>
              </div>

              <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-5 gap-2">
                {methods.map((m) => (
                  <button suppressHydrationWarning
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={method === m.value}
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-xs font-medium transition-colors",
                      method === m.value ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line text-ink-2 hover:border-line-strong",
                    )}
                  >
                    <m.icon className="size-[18px]" />
                    {m.label}
                    <span className="absolute top-1 right-1.5 text-[9px] text-subtle">{m.key}</span>
                  </button>
                ))}
              </div>

              {method === "CASH" ? (
                <div className="space-y-3">
                  <Field label="Cash received">
                    <Input autoFocus inputSize="lg" inputMode="decimal" prefix="₹" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={(amountDue / 100).toFixed(2)} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    {quickTenders(amountDue).map((t) => (
                      <Button key={t} variant={receivedMinor === t ? "secondary" : "outline"} size="sm" onClick={() => setReceived(String(t / 100))}>
                        {t === amountDue ? "Exact" : formatMoney(t)}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
                    <span className="text-[13px] text-muted">Change due</span>
                    <span className="text-lg font-semibold text-ink">{formatMoney(change)}</span>
                  </div>
                </div>
              ) : null}

              {method === "CARD" ? (
                <Field label="Card reference" optional description="Last 4 digits or terminal approval code.">
                  <Input autoFocus value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4417 / APPR 812233" />
                </Field>
              ) : null}

              {method === "UPI" ? (
                <div className="flex gap-4">
                  {upiLink ? (
                    <div className="shrink-0 rounded-xl border border-line p-2">
                      <QRCodeSVG value={upiLink} size={120} />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[13px] text-muted">
                      {upiId ? (
                        <>
                          Ask the guest to scan and pay to <span className="font-medium text-ink">{upiId}</span>.
                        </>
                      ) : (
                        "Add your UPI ID in Settings → Payment to show a payment QR here."
                      )}
                    </p>
                    <Field label="UPI transaction ID" optional>
                      <Input autoFocus value={reference} onChange={(e) => setReference(e.target.value)} placeholder="12-digit UTR" />
                    </Field>
                  </div>
                </div>
              ) : null}

              {method === "OTHER" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Method">
                    <NativeSelect value={otherMethod} onChange={(e) => setOtherMethod(e.target.value as "WALLET" | "OTHER")}>
                      <option value="WALLET">Wallet (Paytm, PhonePe…)</option>
                      <option value="OTHER">Other / on account</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Reference" optional>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {method === "SPLIT" ? (
                <div className="space-y-2">
                  {split.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <NativeSelect
                        className="w-[120px]"
                        value={row.method}
                        onChange={(e) => setSplit(split.map((r, j) => (j === i ? { ...r, method: e.target.value as PayMethod } : r)))}
                      >
                        {(["CASH", "CARD", "UPI", "WALLET", "OTHER"] as const).map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABEL[m]}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input className="flex-1" inputMode="decimal" prefix="₹" value={row.amount} onChange={(e) => setSplit(split.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))} />
                      <Input className="w-[120px]" placeholder="Ref." value={row.reference} onChange={(e) => setSplit(split.map((r, j) => (j === i ? { ...r, reference: e.target.value } : r)))} />
                      <Button variant="ghost" size="icon-sm" aria-label="Remove" disabled={split.length <= 1} onClick={() => setSplit(split.filter((_, j) => j !== i))}>
                        <Trash />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <Button variant="ghost" size="sm" disabled={split.length >= 5} onClick={() => setSplit([...split, { method: "CARD", amount: String(Math.max(0, amountDue - splitTotal) / 100), reference: "" }])}>
                      <Plus /> Add payment
                    </Button>
                    <span className={cn("text-[13px]", splitTotal === amountDue ? "text-success-700" : "text-muted")}>
                      {formatMoney(splitTotal)} of {formatMoney(amountDue)}
                    </span>
                  </div>
                  {partial ? (
                    <InlineAlert tone="info">
                      Collect {formatMoney(splitTotal)} now — {formatMoney(amountDue - splitTotal)} will remain due on the order.
                    </InlineAlert>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="text-[13px] text-danger-700">{error}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="lg" onClick={confirm} loading={busy} disabled={!!error}>
                {partial ? `Collect ${formatMoney(splitTotal)}` : `Confirm ${formatMoney(amountDue)}`}
                <Kbd className="border-white/30 bg-white/15 text-white">Enter</Kbd>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function quickTenders(due: number): number[] {
  const out = new Set<number>([due]);
  for (const step of [5000, 10000, 50000]) out.add(Math.ceil(due / step) * step);
  if (due < 200000) out.add(200000);
  return [...out].filter((v) => v >= due).sort((a, b) => a - b).slice(0, 5);
}

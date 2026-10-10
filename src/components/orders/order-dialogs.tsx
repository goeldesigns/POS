"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { cancelOrderAction, refundOrderAction } from "@/server/actions/orders";

const CANCEL_REASONS = ["Guest left before service", "Ordered by mistake", "Item unavailable", "Kitchen delay", "Duplicate order"];

export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
  onDone,
}: {
  order: { id: string; orderNumber: string; table?: { name: string } | null } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const run = useAction(cancelOrderAction, {
    success: (o) => `Order ${o.orderNumber} cancelled`,
    onSuccess: () => {
      onOpenChange(false);
      onDone?.();
    },
  });
  if (!order) return null;
  const submit = () => {
    if (reason.trim()) run.execute({ orderId: order.id, reason: reason.trim() });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Cancel ${order.orderNumber}?`}
        description={`The kitchen ticket is voided${order.table ? ` and table ${order.table.name} is freed` : ""}. This can't be undone.`}
        size="sm"
      >
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogBody className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {CANCEL_REASONS.map((r) => (
                <Button key={r} type="button" size="xs" variant={reason === r ? "secondary" : "outline"} onClick={() => setReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <Field label="Reason" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[64px]" maxLength={200} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep order
            </Button>
            <Button type="submit" variant="danger" loading={run.pending} disabled={!reason.trim()}>
              Cancel order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RefundDialog({
  order,
  open,
  onOpenChange,
  onDone,
}: {
  order: { id: string; orderNumber: string; paidTotal: number; refundedTotal: number; defaultMethod?: string; hasLoyalty?: boolean } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const refundable = order ? order.paidTotal - order.refundedTotal : 0;
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("CASH");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open && order) {
      setAmount(String(refundable / 100));
      setMethod(order.defaultMethod ?? "CASH");
      setReason("");
    }
  }, [open, order, refundable]);
  const run = useAction(refundOrderAction, {
    success: (o) => `Refund recorded on ${o.orderNumber}`,
    onSuccess: () => {
      onOpenChange(false);
      onDone?.();
    },
  });
  if (!order) return null;
  const n = Number(amount);
  const valid = n > 0 && Math.round(n * 100) <= refundable && reason.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Refund ${order.orderNumber}`} description={`Up to ${formatMoney(refundable)} can be refunded.`} size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) run.execute({ orderId: order.id, amount, method: method as never, reason: reason.trim() });
          }}
        >
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount" required>
                <Input inputMode="decimal" prefix="₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Refund via" required>
                <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field
              label="Reason"
              required
              description={order.hasLoyalty ? "A full refund gives back redeemed points and takes back points earned on this order." : undefined}
            >
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Food quality complaint" maxLength={200} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={run.pending} disabled={!valid}>
              Refund {valid ? formatMoney(Math.round(n * 100)) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

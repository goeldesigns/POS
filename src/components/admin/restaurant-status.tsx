"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { activateRestaurantAction, archiveRestaurantAction, suspendRestaurantAction } from "@/server/actions/platform";

export interface StatusTarget {
  id: string;
  name: string;
  status: string;
}

export type StatusChange = "suspend" | "activate" | "archive";

const REASONS = ["Subscription payment overdue", "Requested by the owner", "Terms of service violation", "Duplicate account"];

/**
 * Suspend (reason required), re-activate/restore, and archive (type the name
 * to confirm). One component so the table, detail header and danger zone
 * behave identically.
 */
export function RestaurantStatusDialogs({
  target,
  change,
  onClose,
  onArchived,
}: {
  target: StatusTarget | null;
  change: StatusChange | null;
  onClose: () => void;
  onArchived?: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (change === "suspend") setReason("");
  }, [change]);

  const done = () => {
    onClose();
    router.refresh();
  };
  const suspend = useAction(suspendRestaurantAction, { success: "Restaurant suspended — its users now see a suspension notice", onSuccess: done });
  const activate = useAction(activateRestaurantAction, {
    success: target?.status === "ARCHIVED" ? "Restaurant restored" : "Restaurant re-activated",
    onSuccess: done,
  });
  const archive = useAction(archiveRestaurantAction, {
    success: "Restaurant archived",
    onSuccess: () => {
      onClose();
      if (onArchived) onArchived();
      else router.refresh();
    },
  });

  if (!target) return null;
  const restoring = target.status === "ARCHIVED";

  return (
    <>
      <Dialog open={change === "suspend"} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          title={`Suspend ${target.name}?`}
          description="Everyone at this restaurant is blocked from the POS and back office until you re-activate it. Their data stays intact."
          size="sm"
        >
          <DialogBody className="space-y-3">
            <Field label="Reason" required description="Shown to the restaurant's users and recorded in the audit log.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} autoFocus placeholder="e.g. Subscription payment overdue by 30 days" />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  suppressHydrationWarning
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-line-strong hover:bg-canvas"
                >
                  {r}
                </button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" loading={suspend.pending} disabled={!reason.trim()} onClick={() => suspend.execute({ id: target.id, reason })}>
              Suspend restaurant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={change === "activate"}
        onOpenChange={(o) => !o && onClose()}
        tone="primary"
        title={restoring ? `Restore ${target.name}?` : `Re-activate ${target.name}?`}
        description={
          restoring
            ? "The restaurant reappears in lists and its users can sign in again. API keys revoked during archiving stay revoked."
            : "Users regain access with their existing roles and permissions."
        }
        confirmLabel={restoring ? "Restore" : "Re-activate"}
        loading={activate.pending}
        onConfirm={() => activate.execute({ id: target.id })}
      />

      <ConfirmDialog
        open={change === "archive"}
        onOpenChange={(o) => !o && onClose()}
        title={`Archive ${target.name}?`}
        description={
          <>
            The restaurant is removed from every list, all of its users are signed out and its API keys are revoked. Orders, customers and
            reports are kept, and you can restore it later from <span className="font-medium text-ink">Restaurants → Archived</span>.
          </>
        }
        confirmText={target.name}
        confirmLabel="Archive restaurant"
        loading={archive.pending}
        onConfirm={() => archive.execute({ id: target.id, confirmName: target.name })}
      />
    </>
  );
}

"use client";

import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

/**
 * Radix focuses the first tabbable element on open, which is usually the close
 * button (and it then shows a focus ring). Instead: start typing straight away
 * when the first control is a text field, otherwise focus the panel itself so
 * Tab still walks the controls in order.
 */
function initialFocus(handler?: (e: Event) => void) {
  return (e: Event) => {
    handler?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const root = e.target as HTMLElement;
    const first = [...root.querySelectorAll<HTMLElement>("[data-overlay-body] :is(input, textarea, select, button, a[href], [tabindex])")].find(
      (el) => el.tabIndex >= 0 && !el.matches(":disabled, [type=hidden]") && !el.closest("[aria-hidden=true], [hidden]") && el.getClientRects().length > 0,
    );
    const typing = first?.matches("textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])");
    const touch = window.matchMedia("(pointer: coarse)").matches;
    (typing && !touch ? first! : root).focus({ preventScroll: true });
  };
}

// ─── Dialog (modal) ─────────────────────────────────────────────────────────

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const sizes = {
  sm: "max-w-[400px]",
  md: "max-w-[520px]",
  lg: "max-w-[680px]",
  xl: "max-w-[880px]",
  "2xl": "max-w-[1040px]",
};

export function DialogContent({
  className,
  children,
  size = "md",
  title,
  description,
  hideClose,
  onOpenAutoFocus,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: keyof typeof sizes;
  title: React.ReactNode;
  description?: React.ReactNode;
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(22_21_42/0.38)] backdrop-blur-[1px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-[max(4vh,24px)] left-1/2 z-50 flex max-h-[calc(100dvh-max(8vh,48px))] w-[calc(100vw-24px)] -translate-x-1/2 flex-col rounded-2xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-pop-in sm:top-[10vh] sm:max-h-[80vh]",
          sizes[size],
          className,
        )}
        onOpenAutoFocus={initialFocus(onOpenAutoFocus)}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-3.5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogPrimitive.Description>
            )}
          </div>
          {!hideClose ? (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          ) : null}
        </div>
        <div data-overlay-body className="contents">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3", className)}
      {...props}
    />
  );
}

// ─── Sheet (side drawer) ────────────────────────────────────────────────────

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;

export function SheetContent({
  className,
  children,
  side = "right",
  title,
  description,
  width = "md",
  headerActions,
  onOpenAutoFocus,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: "right" | "left" | "bottom";
  title: React.ReactNode;
  description?: React.ReactNode;
  width?: "sm" | "md" | "lg";
  headerActions?: React.ReactNode;
}) {
  const w = { sm: "sm:max-w-[380px]", md: "sm:max-w-[480px]", lg: "sm:max-w-[640px]" }[width];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(22_21_42/0.32)] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-pop outline-none",
          side === "right" && cn("inset-y-0 right-0 w-full border-l border-line data-[state=open]:animate-slide-in-right", w),
          side === "left" && "inset-y-0 left-0 w-[280px] border-r border-line data-[state=open]:animate-slide-in-left",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t border-line data-[state=open]:animate-slide-up",
          className,
        )}
        onOpenAutoFocus={initialFocus(onOpenAutoFocus)}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Panel"}</DialogPrimitive.Description>
            )}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
        </div>
        <div data-overlay-body className="contents">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ─── Confirm dialog ─────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  /** Ask the user to type this text before confirming (destructive actions). */
  confirmText?: string;
  loading?: boolean;
  onConfirm: () => unknown;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  confirmText,
  loading,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = confirmText ? typed.trim() !== confirmText : false;

  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(22_21_42/0.38)] data-[state=open]:animate-fade-in" />
        <AlertPrimitive.Content
          className="fixed top-[18vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[420px] -translate-x-1/2 rounded-2xl border border-line bg-surface p-5 shadow-pop data-[state=open]:animate-pop-in"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !blocked && !loading && (e.target as HTMLElement).tagName !== "TEXTAREA") {
              e.preventDefault();
              void onConfirm();
            }
          }}
        >
          <AlertPrimitive.Title className="text-[15px] font-semibold text-ink">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description asChild>
            <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</div>
          </AlertPrimitive.Description>
          {children ? <div className="mt-4">{children}</div> : null}
          {confirmText ? (
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-xs text-muted">
                Type <span className="font-semibold text-ink">{confirmText}</span> to confirm
              </label>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertPrimitive.Cancel asChild>
              <Button variant="outline" disabled={loading}>
                Cancel
              </Button>
            </AlertPrimitive.Cancel>
            <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} disabled={blocked} onClick={() => void onConfirm()}>
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}

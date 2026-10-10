"use client";

import { DropdownMenu as Primitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Dropdown menu ──────────────────────────────────────────────────────────

export const DropdownMenu = Primitive.Root;
export function DropdownMenuTrigger(props: React.ComponentPropsWithoutRef<typeof Primitive.Trigger>) {
  return <Primitive.Trigger suppressHydrationWarning {...props} />;
}
export const DropdownMenuGroup = Primitive.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-[180px] rounded-xl border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Item> & { tone?: "danger" }) {
  return (
    <Primitive.Item
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-ink outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-sunken [&_svg]:size-4 [&_svg]:text-muted",
        tone === "danger" && "text-danger-700 data-[highlighted]:bg-danger-50 [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-2.5 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-subtle uppercase", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export const DropdownMenuCheckboxItem = function CheckboxItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      className={cn(
        "relative flex h-8 cursor-pointer items-center gap-2 rounded-lg pr-2.5 pl-8 text-[13px] text-ink outline-none select-none data-[highlighted]:bg-sunken",
        className,
      )}
      {...props}
    >
      <Primitive.ItemIndicator className="absolute left-2.5 text-brand-500">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Primitive.ItemIndicator>
      {children}
    </Primitive.CheckboxItem>
  );
};

// ─── Popover ────────────────────────────────────────────────────────────────

export const Popover = PopoverPrimitive.Root;
export function PopoverTrigger(props: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger suppressHydrationWarning {...props} />;
}
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 rounded-xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-pop-in", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 250,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-[260px] rounded-lg bg-night px-2.5 py-1.5 text-xs leading-snug text-white shadow-pop data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

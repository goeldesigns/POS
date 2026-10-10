"use client";

import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from "radix-ui";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      suppressHydrationWarning
      className={cn(
        "peer grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-surface shadow-card transition-colors",
        "hover:border-brand-400 data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500 data-[state=indeterminate]:border-brand-500 data-[state=indeterminate]:bg-brand-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-white">
        {props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { size?: "sm" | "md" }
>(function Switch({ className, size = "md", ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      suppressHydrationWarning
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-transparent bg-line-strong p-0.5 transition-colors data-[state=checked]:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-[18px] w-8" : "h-[22px] w-[38px]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform",
          size === "sm" ? "size-3.5 data-[state=checked]:translate-x-3.5" : "size-[18px] data-[state=checked]:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
});

/** Labeled switch row used across settings forms. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  const autoId = React.useId();
  const switchId = id ?? autoId;
  return (
    <div className="flex items-start justify-between gap-6 py-1">
      <label htmlFor={switchId} className="min-w-0 cursor-pointer">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span> : null}
      </label>
      <Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

/** Compact segmented control (e.g. Calendar | List, Today | 7D | 30D). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-lg border border-line bg-sunken p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button suppressHydrationWarning
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors [&_svg]:size-3.5",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              active ? "bg-surface text-ink shadow-[0_1px_2px_rgb(20_18_48/0.08)]" : "text-muted hover:text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

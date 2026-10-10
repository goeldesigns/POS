import * as React from "react";
import { cn } from "@/lib/utils";

export const inputBase =
  "w-full rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-subtle shadow-card transition-[border-color,box-shadow] duration-150 outline-none hover:border-line-strong focus:border-brand-400 focus:ring-[3px] focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-50";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix" | "size"> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  inputSize?: "sm" | "md" | "lg";
  invalid?: boolean;
}

const heights = { sm: "h-8", md: "h-9", lg: "h-11 text-[15px]" };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, prefix, suffix, inputSize = "md", invalid, ...props },
  ref,
) {
  const input = (
    <input suppressHydrationWarning
      ref={ref}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(
        inputBase,
        heights[inputSize],
        "px-3",
        prefix ? "pl-9" : null,
        suffix ? "pr-10" : null,
        !prefix && !suffix ? className : null,
      )}
      {...props}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className={cn("relative", className)}>
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-subtle [&_svg]:size-4">
          {prefix}
        </span>
      ) : null}
      {input}
      {suffix ? (
        <span className="absolute inset-y-0 right-2.5 flex items-center text-xs text-subtle [&_svg]:size-4">{suffix}</span>
      ) : null}
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea suppressHydrationWarning
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, "min-h-[84px] resize-y px-3 py-2 leading-relaxed", className)}
        {...props}
      />
    );
  },
);

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; selectSize?: "sm" | "md" }
>(function NativeSelect({ className, invalid, selectSize = "md", children, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <select suppressHydrationWarning
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, selectSize === "sm" ? "h-8 text-[13px]" : "h-9", "appearance-none pr-9 pl-3")}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </div>
  );
});

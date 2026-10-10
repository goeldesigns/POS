import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-500 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(48_32_160/0.25)] hover:bg-brand-600 active:bg-brand-700",
        secondary: "bg-brand-100 text-brand-600 hover:bg-brand-150 active:bg-brand-200",
        outline: "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-canvas active:bg-sunken",
        ghost: "text-muted hover:bg-sunken hover:text-ink active:bg-line/60",
        danger: "bg-danger text-white hover:bg-danger-700",
        "danger-soft": "bg-danger-50 text-danger-700 hover:bg-danger-100",
        success: "bg-success text-white hover:bg-success-700",
        link: "h-auto px-0 text-brand-500 underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-3 text-[13px] [&_svg]:size-4",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px]",
        xl: "h-12 px-5 text-[15px] font-semibold [&_svg]:size-5",
        icon: "size-9 [&_svg]:size-[18px]",
        "icon-sm": "size-8 [&_svg]:size-4",
        "icon-xs": "size-7 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button suppressHydrationWarning
      ref={ref}
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

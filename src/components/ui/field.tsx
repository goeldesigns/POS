import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-ink-2", className)} {...props} />;
}

interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/** Label above, control, then help or error text. */
export function Field({ label, htmlFor, description, error, required, optional, className, children, action }: FieldProps) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={htmlFor}>
            {label}
            {required ? <span className="ml-0.5 text-danger">*</span> : null}
            {optional ? <span className="ml-1.5 text-xs font-normal text-subtle">Optional</span> : null}
          </Label>
          {action}
        </div>
      ) : null}
      {children}
      {message ? (
        <p role="alert" className="text-xs text-danger-700">
          {message}
        </p>
      ) : description ? (
        <p className="text-xs text-muted">{description}</p>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-x-10 gap-y-4 border-b border-line py-6 last:border-b-0 lg:grid-cols-[240px_1fr]", className)}>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function FormGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />;
}

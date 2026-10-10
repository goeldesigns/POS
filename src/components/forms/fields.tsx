"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { Controller, useForm, type Control, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Checkbox, Switch, SwitchRow } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

/** RHF form typed by a Zod schema's input/output. */
export function useZodForm<S extends z.ZodType<unknown, FieldValues>>(schema: S, defaultValues: z.input<S>) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never),
    defaultValues: defaultValues as never,
  });
}

/**
 * Validate on the client, then send the *raw* values to the server action,
 * which re-validates with the same schema. Field errors from the server are
 * mapped back onto the form.
 */
export function useFormSubmit<V extends FieldValues, R>(
  form: UseFormReturn<V, unknown, never> | UseFormReturn<V, unknown, FieldValues>,
  action: (input: V) => Promise<ActionResult<R>>,
  opts: { success?: string | ((data: R) => string); onSuccess?: (data: R) => void } = {},
) {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  return form.handleSubmit(async () => {
    const result = await action(form.getValues());
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) form.setError(name as Path<V>, { type: "server", message: messages[0] });
        }
      }
      toast.error(result.error);
      return;
    }
    const msg = typeof optsRef.current.success === "function" ? optsRef.current.success(result.data) : optsRef.current.success;
    if (msg) toast.success(msg);
    optsRef.current.onSuccess?.(result.data);
  });
}

type Base<T extends FieldValues> = {
  control: Control<T, unknown, never> | Control<T, unknown, FieldValues>;
  name: Path<T>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
};

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  optional,
  className,
  ...input
}: Base<T> & Omit<React.ComponentProps<typeof Input>, "name" | "form">) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} description={description} error={fieldState.error?.message} required={required} optional={optional} className={className} htmlFor={name}>
          <Input id={name} {...input} {...field} value={(field.value as string | number | null | undefined) ?? ""} invalid={!!fieldState.error} />
        </Field>
      )}
    />
  );
}

export function MoneyField<T extends FieldValues>(props: Base<T> & { placeholder?: string; currencySymbol?: string }) {
  return <TextField {...props} inputMode="decimal" prefix={props.currencySymbol ?? "₹"} />;
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  optional,
  className,
  ...rest
}: Base<T> & Omit<React.ComponentProps<typeof Textarea>, "name" | "form">) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} description={description} error={fieldState.error?.message} required={required} optional={optional} className={className} htmlFor={name}>
          <Textarea id={name} {...rest} {...field} value={(field.value as string | null | undefined) ?? ""} invalid={!!fieldState.error} />
        </Field>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  optional,
  className,
  options,
  placeholder,
  disabled,
}: Base<T> & { options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} description={description} error={fieldState.error?.message} required={required} optional={optional} className={className} htmlFor={name}>
          <NativeSelect id={name} {...field} value={(field.value as string | null | undefined) ?? ""} invalid={!!fieldState.error} disabled={disabled}>
            {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
}: Omit<Base<T>, "required" | "optional" | "className"> & { disabled?: boolean }) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field }) => (
        <SwitchRow label={label} description={description} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
      )}
    />
  );
}

export function InlineSwitch<T extends FieldValues>({ control, name, label }: { control: Base<T>["control"]; name: Path<T>; label: string }) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <Switch size="sm" checked={!!field.value} onCheckedChange={field.onChange} />
          {label}
        </label>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({ control, name, label }: { control: Base<T>["control"]; name: Path<T>; label: React.ReactNode }) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
          <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} />
          {label}
        </label>
      )}
    />
  );
}

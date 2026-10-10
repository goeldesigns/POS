"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Eye, EyeOff, Lock, Mail, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyFieldErrors } from "@/hooks/use-action";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/auth";
import {
  adminLoginAction,
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  signupAction,
} from "@/server/actions/auth";

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? "text" : "password"}
      prefix={<Lock />}
      suffix={
        <button suppressHydrationWarning
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="rounded p-0.5 text-subtle hover:text-ink"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      }
    />
  );
}

// ─── Login ──────────────────────────────────────────────────────────────────

type LoginInput = z.input<typeof loginSchema>;

export function LoginForm({
  next,
  variant = "restaurant",
  demoAccounts,
  notice,
}: {
  next?: string;
  variant?: "restaurant" | "admin";
  demoAccounts?: { label: string; email: string; password: string }[];
  notice?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true, next },
  });
  const { register, handleSubmit, formState, setValue, watch } = form;

  const onSubmit = handleSubmit(async () => {
    setError(null);
    const action = variant === "admin" ? adminLoginAction : loginAction;
    const result = await action(form.getValues());
    if (!result.ok) {
      setError(result.error);
      applyFieldErrors(result, form.setError as never);
      return;
    }
    router.push(result.data.redirectTo);
    router.refresh();
  });

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
        {variant === "admin" ? "Platform console" : "Welcome back"}
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        {variant === "admin" ? "Sign in with your platform administrator account." : "Sign in to your restaurant workspace."}
      </p>

      {notice ? (
        <InlineAlert tone="success" icon={<CircleCheck />} className="mt-5">
          {notice}
        </InlineAlert>
      ) : null}
      {error ? (
        <InlineAlert tone="danger" className="mt-5">
          {error}
        </InlineAlert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputSize="lg" prefix={<Mail />} placeholder="you@restaurant.com" autoFocus {...register("email")} invalid={!!formState.errors.email} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={formState.errors.password?.message}
          action={
            variant === "restaurant" ? (
              <Link href="/auth/forgot-password" className="text-xs font-medium text-brand-500 hover:text-brand-600">
                Forgot password?
              </Link>
            ) : null
          }
        >
          <PasswordInput id="password" autoComplete="current-password" inputSize="lg" placeholder="••••••••" {...register("password")} invalid={!!formState.errors.password} />
        </Field>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <Checkbox checked={watch("remember")} onCheckedChange={(v) => setValue("remember", v === true)} />
          Keep me signed in for 14 days
        </label>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      {variant === "restaurant" ? (
        <p className="mt-6 text-center text-[13px] text-muted">
          New to Tabla?{" "}
          <Link href="/auth/signup" className="font-medium text-brand-500 hover:text-brand-600">
            Create a restaurant account
          </Link>
        </p>
      ) : null}

      {demoAccounts?.length ? (
        <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-canvas p-3.5">
          <p className="text-2xs font-semibold tracking-wide text-muted uppercase">Demo accounts · development only</p>
          <div className="mt-2 grid gap-1">
            {demoAccounts.map((a) => (
              <button suppressHydrationWarning
                key={a.email}
                type="button"
                onClick={() => {
                  setValue("email", a.email);
                  setValue("password", a.password);
                }}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface"
              >
                <span className="font-medium text-ink">{a.label}</span>
                <span className="truncate text-muted">{a.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-2xs text-subtle">Click to fill. Passwords are listed in the README.</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Signup ─────────────────────────────────────────────────────────────────

type SignupInput = z.input<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SignupInput, unknown, z.output<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { restaurantName: "", ownerName: "", email: "", phone: "", password: "", confirmPassword: "" },
  });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;

  const onSubmit = handleSubmit(async () => {
    setError(null);
    const result = await signupAction(form.getValues());
    if (!result.ok) {
      setError(result.error);
      applyFieldErrors(result, form.setError as never);
      return;
    }
    router.push(result.data.redirectTo);
    router.refresh();
  });

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Create your restaurant</h1>
      <p className="mt-1 text-[13px] text-muted">Start a free trial. No card required — you can add tables, menu and staff after signing up.</p>
      {error ? (
        <InlineAlert tone="danger" className="mt-5">
          {error}
        </InlineAlert>
      ) : null}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Restaurant name" htmlFor="restaurantName" error={e.restaurantName?.message}>
          <Input id="restaurantName" prefix={<Store />} placeholder="e.g. Spice & Stone" autoFocus {...register("restaurantName")} invalid={!!e.restaurantName} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="ownerName" error={e.ownerName?.message}>
            <Input id="ownerName" autoComplete="name" {...register("ownerName")} invalid={!!e.ownerName} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={e.phone?.message}>
            <Input id="phone" type="tel" autoComplete="tel" placeholder="98450 12345" {...register("phone")} invalid={!!e.phone} />
          </Field>
        </div>
        <Field label="Work email" htmlFor="email" error={e.email?.message} description="You'll sign in with this email.">
          <Input id="email" type="email" autoComplete="email" prefix={<Mail />} {...register("email")} invalid={!!e.email} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={e.password?.message}>
            <PasswordInput id="password" autoComplete="new-password" {...register("password")} invalid={!!e.password} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={e.confirmPassword?.message}>
            <PasswordInput id="confirmPassword" autoComplete="new-password" {...register("confirmPassword")} invalid={!!e.confirmPassword} />
          </Field>
        </div>
        <p className="text-xs text-muted">At least 8 characters with a letter and a number.</p>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-medium text-brand-500 hover:text-brand-600">
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ─── Forgot / reset ─────────────────────────────────────────────────────────

export function ForgotPasswordForm({ devHint }: { devHint?: boolean }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>, unknown, z.output<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const onSubmit = form.handleSubmit(async () => {
    setError(null);
    const result = await forgotPasswordAction(form.getValues());
    if (!result.ok) return setError(result.error);
    setSent(true);
  });

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Reset your password</h1>
      <p className="mt-1 text-[13px] text-muted">Enter the email you sign in with and we&apos;ll send you a reset link.</p>
      {sent ? (
        <InlineAlert tone="success" icon={<CircleCheck />} className="mt-6" title="Check your inbox">
          If an account exists for {form.getValues("email")}, a reset link is on its way. It expires in 30 minutes.
          {devHint ? <span className="mt-1 block">Development: the link is printed in the server console.</span> : null}
        </InlineAlert>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" inputSize="lg" prefix={<Mail />} autoFocus {...form.register("email")} invalid={!!form.formState.errors.email} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[13px]">
        <Link href="/auth/login" className="font-medium text-brand-500 hover:text-brand-600">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof resetPasswordSchema>, unknown, z.output<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async () => {
    setError(null);
    const result = await resetPasswordAction(form.getValues());
    if (!result.ok) return setError(result.error);
    router.push("/auth/login?reset=1");
  });

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">Choose a new password</h1>
      <p className="mt-1 text-[13px] text-muted">You&apos;ll be signed out of other devices after resetting.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
        <Field label="New password" htmlFor="password" error={e.password?.message} description="At least 8 characters with a letter and a number.">
          <PasswordInput id="password" autoComplete="new-password" inputSize="lg" autoFocus {...form.register("password")} invalid={!!e.password} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" error={e.confirmPassword?.message}>
          <PasswordInput id="confirmPassword" autoComplete="new-password" inputSize="lg" {...form.register("confirmPassword")} invalid={!!e.confirmPassword} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </div>
  );
}

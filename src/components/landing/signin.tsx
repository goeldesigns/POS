"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { InlineAlert } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { loginSchema } from "@/lib/validation/auth";
import { loginAction } from "@/server/actions/auth";

export interface DemoAccount {
  label: string;
  email: string;
  password: string;
}

const SignInContext = React.createContext<{ open: () => void }>({ open: () => {} });
export const useSignIn = () => React.useContext(SignInContext);

export function SignInProvider({
  demoAccounts,
  signupEnabled,
  children,
}: {
  demoAccounts?: DemoAccount[];
  signupEnabled: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const searchParams = useSearchParams();
  React.useEffect(() => {
    if (searchParams.get("signin") === "1") setOpen(true);
  }, [searchParams]);
  const value = React.useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <SignInContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Sign in" description="Your restaurant POS or the platform console" width="md" className="sm:max-w-[460px]">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 scrollbar-thin sm:px-8">
            <SignInPanel demoAccounts={demoAccounts} signupEnabled={signupEnabled} next={searchParams.get("next") ?? undefined} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </SignInContext.Provider>
  );
}

/** Button that opens the sign-in panel (usable from server-rendered sections). */
export function SignInButton({ className, children, variant = "outline", size = "md" }: { className?: string; children?: React.ReactNode; variant?: "outline" | "ghost" | "primary" | "secondary"; size?: "sm" | "md" | "lg" }) {
  const { open } = useSignIn();
  return (
    <Button variant={variant} size={size} className={className} onClick={open}>
      {children ?? "Sign in"}
    </Button>
  );
}

type LoginInput = z.input<typeof loginSchema>;

function SignInPanel({
  demoAccounts,
  signupEnabled,
  next,
  onNavigate,
}: {
  demoAccounts?: DemoAccount[];
  signupEnabled: boolean;
  next?: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const form = useForm<LoginInput, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true, next },
  });
  const { register, handleSubmit, formState, setValue, watch } = form;

  const onSubmit = handleSubmit(async () => {
    setError(null);
    const result = await loginAction(form.getValues());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(result.data.redirectTo);
    router.refresh();
  });

  return (
    <div>
      <Logo subtitle={null} className="mb-6" />
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Log in to your POS</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Use the login your restaurant was given. You&apos;ll go straight to your own restaurant&apos;s POS.
      </p>

      {error ? (
        <InlineAlert tone="danger" className="mt-5">
          {error}
        </InlineAlert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <Field label="Email" htmlFor="lp-email" error={formState.errors.email?.message}>
          <Input id="lp-email" type="email" autoComplete="email" inputSize="lg" prefix={<Mail />} placeholder="you@restaurant.com" {...register("email")} invalid={!!formState.errors.email} />
        </Field>
        <Field
          label="Password"
          htmlFor="lp-password"
          error={formState.errors.password?.message}
          action={
            <Link href="/auth/forgot-password" className="text-xs font-medium text-brand-500 hover:text-brand-600">
              Forgot password?
            </Link>
          }
        >
          <Input
            id="lp-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            inputSize="lg"
            prefix={<Lock />}
            placeholder="••••••••"
            {...register("password")}
            invalid={!!formState.errors.password}
            suffix={
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded p-0.5 text-subtle hover:text-ink"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
          />
        </Field>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <Checkbox checked={watch("remember")} onCheckedChange={(v) => setValue("remember", v === true)} />
          Keep me signed in for 14 days
        </label>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Sign in <ArrowRight />
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-mint" />
        Sessions are encrypted and every sign-in is recorded in your restaurant&apos;s activity log.
      </p>

      <div className="mt-6 rounded-xl bg-canvas p-4 text-[13px]">
        <p className="font-medium text-ink">New to Tabla?</p>
        <p className="mt-0.5 text-muted">
          <a href="#demo" onClick={onNavigate} className="font-medium text-brand-600 hover:underline">
            Book a 30-minute demo
          </a>
          {signupEnabled ? (
            <>
              {" "}or{" "}
              <Link href="/auth/signup" className="font-medium text-brand-600 hover:underline">
                start a free trial
              </Link>
            </>
          ) : null}
          .
        </p>
      </div>

      {demoAccounts?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-strong p-3.5">
          <p className="text-2xs font-semibold tracking-wide text-muted uppercase">Demo accounts · development only</p>
          <div className="mt-2 grid gap-0.5">
            {demoAccounts.map((a) => (
              <button
                suppressHydrationWarning
                key={a.email}
                type="button"
                onClick={() => {
                  setValue("email", a.email);
                  setValue("password", a.password);
                }}
                className={cn("flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-canvas")}
              >
                <span className="font-medium text-ink">{a.label}</span>
                <span className="truncate text-muted">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

interface Options<R> {
  /** Toast shown on success (string or derived from the result). */
  success?: string | ((data: R) => string);
  onSuccess?: (data: R) => void;
  onError?: (error: Extract<ActionResult<R>, { ok: false }>) => void;
  /** Suppress the default error toast (e.g. when showing field errors inline). */
  quietErrors?: boolean;
}

/**
 * Run a server action with pending state, success/error toasts and a guard
 * against double submission. Server-side validation errors are surfaced
 * without exposing internals.
 */
export function useAction<I, R>(action: (input: I) => Promise<ActionResult<R>>, options: Options<R> = {}) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const optsRef = useRef(options);
  optsRef.current = options;

  const execute = useCallback(
    async (input: I): Promise<ActionResult<R>> => {
      if (inFlight.current) return { ok: false, error: "Please wait…" };
      inFlight.current = true;
      setPending(true);
      try {
        const result = await action(input);
        const o = optsRef.current;
        if (result.ok) {
          const msg = typeof o.success === "function" ? o.success(result.data) : o.success;
          if (msg) toast.success(msg);
          o.onSuccess?.(result.data);
        } else {
          if (!o.quietErrors) toast.error(result.error);
          o.onError?.(result);
        }
        return result;
      } catch {
        const failure = { ok: false as const, error: "Unable to reach the server. Check your connection and try again." };
        toast.error(failure.error);
        return failure;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [action],
  );

  return { execute, pending };
}

/** Push server field errors into a react-hook-form instance. */
export function applyFieldErrors(
  result: ActionResult<unknown>,
  setError: (name: never, error: { type: string; message: string }) => void,
) {
  if (result.ok || !result.fieldErrors) return;
  for (const [name, messages] of Object.entries(result.fieldErrors)) {
    if (messages?.[0]) setError(name as never, { type: "server", message: messages[0] });
  }
}

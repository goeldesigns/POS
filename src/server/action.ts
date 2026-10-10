import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { can } from "@/lib/permissions/can";
import type { PermissionKey } from "@/lib/permissions/catalog";
import type { ActionResult } from "@/lib/action-result";
import { getPlatformContext, getRestaurantContext, type PlatformContext, type RestaurantContext } from "./auth/context";
import { ForbiddenError, toAppError, UnauthorizedError } from "./errors";

export type { ActionResult };

interface ActionConfig<S extends z.ZodType> {
  /** Any-of permission requirement, checked server side on every call. */
  permission?: PermissionKey | readonly PermissionKey[];
  schema: S;
  /** Path to revalidate on success (defaults to the whole app shell). */
  revalidate?: string | false;
}

function failure(error: unknown): ActionResult<never> {
  unstable_rethrow(error);
  const appError = toAppError(error);
  return { ok: false, error: appError.message, code: appError.code, fieldErrors: appError.fieldErrors };
}

function invalid(error: z.ZodError): ActionResult<never> {
  const flat = z.flattenError(error);
  const fieldErrors = flat.fieldErrors as Record<string, string[]>;
  const first = Object.values(fieldErrors)[0]?.[0] ?? flat.formErrors[0];
  return { ok: false, error: first ?? "Please check the form and try again", code: "validation_error", fieldErrors };
}

/**
 * Wrap a restaurant-scoped server action with: session resolution, tenant
 * context, server-side permission check, Zod validation, safe error mapping
 * and revalidation. Server actions are public endpoints — never rely on the UI
 * hiding a button.
 */
export function restaurantAction<S extends z.ZodType, R>(
  config: ActionConfig<S>,
  handler: (input: z.output<S>, ctx: RestaurantContext) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const ctx = await getRestaurantContext();
      if (!ctx) throw new UnauthorizedError();
      if (config.permission) {
        const keys = (Array.isArray(config.permission) ? config.permission : [config.permission]) as PermissionKey[];
        if (!keys.some((key) => can(ctx, key))) throw new ForbiddenError();
      }
      const parsed = config.schema.safeParse(raw);
      if (!parsed.success) return invalid(parsed.error);
      const data = await handler(parsed.data, ctx);
      if (config.revalidate !== false) revalidatePath(config.revalidate ?? "/app", "layout");
      return { ok: true, data };
    } catch (error) {
      return failure(error);
    }
  };
}

/** Same guarantees for Super Admin actions (platform session required). */
export function platformAction<S extends z.ZodType, R>(
  config: Omit<ActionConfig<S>, "permission">,
  handler: (input: z.output<S>, ctx: PlatformContext) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const ctx = await getPlatformContext();
      if (!ctx) throw new UnauthorizedError();
      const parsed = config.schema.safeParse(raw);
      if (!parsed.success) return invalid(parsed.error);
      const data = await handler(parsed.data, ctx);
      if (config.revalidate !== false) revalidatePath(config.revalidate ?? "/super-admin", "layout");
      return { ok: true, data };
    } catch (error) {
      return failure(error);
    }
  };
}

/** For unauthenticated flows (login, signup, password reset). */
export function publicAction<S extends z.ZodType, R>(
  schema: S,
  handler: (input: z.output<S>) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalid(parsed.error);
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      return failure(error);
    }
  };
}

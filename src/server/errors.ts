/**
 * Errors that are safe to show to users. Anything else is logged and replaced
 * with a generic message so backend details never reach the browser.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(message: string, opts: { status?: number; code?: string; fieldErrors?: Record<string, string[]> } = {}) {
    super(message);
    this.name = "AppError";
    this.status = opts.status ?? 400;
    this.code = opts.code ?? "bad_request";
    this.fieldErrors = opts.fieldErrors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue") {
    super(message, { status: 401, code: "unauthorized" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, { status: 403, code: "forbidden" });
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super(`${entity} not found`, { status: 404, code: "not_found" });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, { status: 409, code: "conflict" });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message, { status: 422, code: "validation_error", fieldErrors });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait a moment and try again.") {
    super(message, { status: 429, code: "rate_limited" });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, { status: 400, code: "business_rule" });
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string) {
    super(message, { status: 402, code: "plan_limit" });
  }
}

interface PrismaLikeError {
  code?: string;
  meta?: { target?: string[] | string; modelName?: string };
}

/** Map an unknown error to a user-safe AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const prismaError = error as PrismaLikeError;
  if (prismaError && typeof prismaError.code === "string") {
    if (prismaError.code === "P2002") {
      const target = prismaError.meta?.target;
      const field = Array.isArray(target) ? target.filter((t) => t !== "restaurantId").join(", ") : target;
      return new ConflictError(field ? `A record with this ${field} already exists` : "This record already exists");
    }
    if (prismaError.code === "P2025") return new NotFoundError();
    if (prismaError.code === "P2003") return new BusinessRuleError("This record is linked to other data and can't be changed");
  }

  console.error("[unexpected error]", error);
  return new AppError("Something went wrong. Please try again.", { status: 500, code: "internal_error" });
}

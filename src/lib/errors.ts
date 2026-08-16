/**
 * Application error types.
 *
 * There is deliberately no `Forbidden` error for tenant-owned resources. A
 * request for an object the caller does not own is answered with NotFound, so
 * responses never confirm that an id exists. See lib/auth/guards.ts.
 */

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The caller is authenticated but their plan does not permit this action. */
export class PaymentRequiredError extends Error {
  readonly status = 402;
  constructor(message = "Your plan does not include this") {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

export class ValidationError extends Error {
  readonly status = 400;
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(
    message = "Too many requests",
    readonly retryAfterSeconds = 60,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

const KNOWN_ERRORS = [
  NotFoundError,
  UnauthorizedError,
  PaymentRequiredError,
  ValidationError,
  RateLimitError,
] as const;

type KnownError = InstanceType<(typeof KNOWN_ERRORS)[number]>;

export function isKnownError(error: unknown): error is KnownError {
  return KNOWN_ERRORS.some((type) => error instanceof type);
}

/**
 * Convert any thrown value into a client-safe { status, message } pair.
 * Unknown errors are flattened to a generic 500 — Prisma messages and stack
 * traces must never reach a client.
 */
export function toClientError(error: unknown): { status: number; message: string } {
  if (isKnownError(error)) return { status: error.status, message: error.message };
  return { status: 500, message: "Something went wrong" };
}

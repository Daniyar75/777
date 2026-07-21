import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@network-crm/contracts";
import { ZodError } from "zod";

/** api-specification.md §1/§3 status mapping, docs/api/error-catalog.md. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  TENANT_MISMATCH: 404,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  DUPLICATE_CONTACT: 409,
  DUPLICATE_PARTNER: 409,
  INVALID_STAGE_TRANSITION: 409,
  NETWORK_CYCLE: 409,
  MASTER_DATA_READ_ONLY: 409,
  VERSION_CONFLICT: 409,
  ORDER_STATE_CONFLICT: 409,
  PRICE_EXPIRED: 409,
  CONSENT_REQUIRED: 422,
  RATE_LIMITED: 429,
  INTEGRATION_UNAVAILABLE: 503,
  AI_POLICY_BLOCKED: 403,
  IDEMPOTENCY_CONFLICT: 409,
};

const RETRYABLE: Partial<Record<ErrorCode, boolean>> = {
  VERSION_CONFLICT: true,
  RATE_LIMITED: true,
  INTEGRATION_UNAVAILABLE: true,
};

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fieldErrors?: Array<{ field: string; code: string; message?: string }>;

  constructor(code: ErrorCode, message: string, fieldErrors?: Array<{ field: string; code: string; message?: string }>) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fieldErrors = fieldErrors;
  }
}

/** Shared body builder — every error response goes through this, never an ad hoc shape. */
export function toErrorBody(err: unknown) {
  const correlationId = randomUUID();

  if (err instanceof ApiHttpError) {
    return {
      status: err.status,
      body: {
        code: err.code,
        message: err.message,
        field_errors: err.fieldErrors,
        correlation_id: correlationId,
        retryable: RETRYABLE[err.code] ?? false,
      },
    };
  }

  if (err instanceof ZodError) {
    return {
      status: STATUS_BY_CODE.VALIDATION_FAILED,
      body: {
        code: "VALIDATION_FAILED" as const,
        message: "Request validation failed",
        field_errors: err.issues.map((i) => ({ field: i.path.join("."), code: i.code, message: i.message })),
        correlation_id: correlationId,
        retryable: false,
      },
    };
  }

  // A DomainError from services-or-modules/* (duck-typed to avoid every module depending on
  // this app's error class; each module owns its own DomainError with the same .code shape).
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code in STATUS_BY_CODE
  ) {
    const code = (err as { code: ErrorCode }).code;
    return {
      status: STATUS_BY_CODE[code],
      body: {
        code,
        message: (err as { message?: string }).message ?? "Request failed",
        correlation_id: correlationId,
        retryable: RETRYABLE[code] ?? false,
      },
    };
  }

  return {
    status: 500,
    body: {
      code: "VALIDATION_FAILED" as const, // no generic 5xx code in the catalog; logged server-side with correlation_id
      message: "Unexpected server error",
      correlation_id: correlationId,
      retryable: true,
    },
  };
}

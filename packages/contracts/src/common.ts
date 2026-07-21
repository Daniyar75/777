import { z } from "zod";

/**
 * Every tenant-scoped business entity carries these fields per
 * docs/requirements/data-dictionary.md preamble. archived_at is added
 * per-entity only where the entity is archivable (BR-025).
 */
export const systemFields = {
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  created_at: z.string().datetime(),
  created_by: z.string().uuid(),
  updated_at: z.string().datetime(),
  version: z.number().int().nonnegative(),
};

export const archivableFields = {
  archived_at: z.string().datetime().nullable(),
};

/** Standard API error envelope, see docs/api/openapi-skeleton.yaml components.schemas.Error. */
export const ErrorCode = z.enum([
  "AUTH_REQUIRED",
  "PERMISSION_DENIED",
  "TENANT_MISMATCH",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "DUPLICATE_CONTACT",
  "DUPLICATE_PARTNER",
  "INVALID_STAGE_TRANSITION",
  "NETWORK_CYCLE",
  "MASTER_DATA_READ_ONLY",
  "VERSION_CONFLICT",
  "ORDER_STATE_CONFLICT",
  "PRICE_EXPIRED",
  "CONSENT_REQUIRED",
  "RATE_LIMITED",
  "INTEGRATION_UNAVAILABLE",
  "AI_POLICY_BLOCKED",
  "IDEMPOTENCY_CONFLICT",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const FieldError = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string().optional(),
});

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  field_errors: z.array(FieldError).optional(),
  correlation_id: z.string().uuid(),
  retryable: z.boolean(),
});
export type ApiError = z.infer<typeof ApiError>;

export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
  });

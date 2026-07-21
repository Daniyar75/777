import type { ErrorCode } from "./common.js";

/**
 * Thrown by application services in every services-or-modules/* package; apps/api's shared
 * error mapper (apps/api/src/errors.ts) turns this into the ApiError envelope + HTTP status
 * from docs/api/error-catalog.md. Lives in @network-crm/contracts (not identity-tenant, not
 * duplicated per module) because every module needs the same shape and every module already
 * depends on this package for its DTOs.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  /** Structured extra data a route handler may surface (e.g. DUPLICATE_CONTACT candidates). */
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

import type { ErrorCode } from "@network-crm/contracts";

/** Thrown by application services; apps/api maps this to the ApiError envelope + HTTP status. */
export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

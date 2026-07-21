# API error catalog

Status: draft. Source list is `docs/requirements/api-specification.md` §3; this document adds HTTP status mapping and retryability so client and server implementations agree before code is written (handoff §3.5). Every error response uses the `Error` schema in `docs/api/openapi-skeleton.yaml`: `code, message, field_errors, correlation_id, retryable`. `message` is always safe for display; PII and internal detail never appear in it or in `field_errors`.

| Code | HTTP status | Meaning | Retryable | Notes |
|---|---|---|---|---|
| `AUTH_REQUIRED` | 401 | No/invalid/expired session | no (until re-auth) | Never distinguishes "expired" from "invalid" in the message (anti-enumeration) |
| `PERMISSION_DENIED` | 403 | RBAC/ABAC denied (role, scope, field, or purpose) | no | Does not reveal whether the resource exists if the requester has no read right (pairs with `NOT_FOUND` semantics below) |
| `TENANT_MISMATCH` | 404 | Resource belongs to a different tenant than the session's active tenant | no | Returned as 404, not 403 — never confirms cross-tenant existence (ACC-019) |
| `NOT_FOUND` | 404 | Resource does not exist (in-tenant, in-scope) | no | |
| `VALIDATION_FAILED` | 422 | Input schema/business validation failed | no (until input fixed) | `field_errors` populated |
| `DUPLICATE_CONTACT` | 409 | Strong-identifier match found on create (BRULE-CONTACT-003) | no | Response includes a reference to the candidate for merge/open, never silently creates |
| `DUPLICATE_PARTNER` | 409 | External `partner_id` already registered in tenant (BRULE-CONTACT-002) | no | |
| `INVALID_STAGE_TRANSITION` | 409 | Funnel transition not allowed from current stage (BRULE-FUNNEL-001) | no | |
| `NETWORK_CYCLE` | 409 | Proposed sponsor relation would create a cycle or self-sponsorship (BRULE-NETWORK-002) | no | Import path returns this per-row in the error report, not as a hard job failure |
| `MASTER_DATA_READ_ONLY` | 409 | Attempted manual write to a field mastered by an external system (mastership-matrix.md) | no | Emergency override path is a distinct privileged operation, not a retry of this call |
| `VERSION_CONFLICT` | 409 | Optimistic-lock (`version`/`If-Match`) mismatch | yes, after re-fetch | Concurrent-update case required by every story's acceptance criteria |
| `ORDER_STATE_CONFLICT` | 409 | Requested order transition invalid for current status (FR-ORDER-004) | no | |
| `PRICE_EXPIRED` | 409 | Resolved price rule no longer valid at confirmation time | no | Client must re-resolve price before retrying |
| `CONSENT_REQUIRED` | 422 | Action requires a consent purpose/channel that is not granted (BRULE-CONSENT-001) | no | Internal task/record is still created where required; only the external send is blocked (FR-FOLLOW-004) |
| `RATE_LIMITED` | 429 | Rate/quota limit hit (login, AI use case, automation, export) | yes, after `Retry-After` | |
| `INTEGRATION_UNAVAILABLE` | 502/503 | Upstream integration unreachable or degraded | yes, with backoff | Triggers capability-matrix graceful degradation (`docs/requirements/integrations.md`) rather than failing the whole request where the field is optional |
| `AI_POLICY_BLOCKED` | 403 | AI Policy Gateway refused (missing source, medical red line, protected-fragment violation, prompt-injection detected) | no | Audited with a safe reason (SEC-013 equivalent, AI-013) |
| `IDEMPOTENCY_CONFLICT` | 409 | Same idempotency key reused with a different payload hash | no | Same key + same payload instead returns the original result (api-specification.md §4) |

## Cross-cutting rules

1. A response never mixes a masked/authorized subset of an object with an error about a different, unauthorized part of the same object — the whole call either returns fully authorized data or an error.
2. `correlation_id` is always present and is the only identifier support needs to look up full technical detail server-side (NFR guidance: "технические детали доступны по correlation ID поддержке").
3. Webhook endpoints additionally use `401` for signature failure and `409`/idempotent-200 for a replayed event — see `docs/events/asyncapi-skeleton.yaml` and ADR-0005.
4. New error codes are added to this table before the endpoint that returns them ships; an endpoint must not return an undocumented code.

# ADR-0004: Authorization model — RBAC + ABAC

Status: proposed

## Context

`docs/requirements/roles-and-permissions.md` defines a hybrid model: RBAC for resource/operation, ABAC for tenant, ownership, branch/generation, mentor assignment, field sensitivity, purpose, and object state, with deny-by-default and deny-over-allow precedence. SEC-001/SEC-004 require least privilege and multi-factor authorization context on every operation, evaluated in the application layer (FR-CORE-001), never only in the UI.

## Decision

- A single **Policy Decision Point (PDP)** library, shared by every module (not reimplemented per module), evaluates: `role → permitted operations on resource type` (RBAC) intersected with `scope predicate` (ABAC: `self | owned | assigned | mentored | branch(depth=N) | tenant | platform`) and `field-level sensitivity mask`.
- Every API operation and every AI use case (BRULE-AI-002: AI scope never exceeds the invoking user's scope) calls the PDP before executing; the PDP call is not optional middleware that can be bypassed by a module.
- Deny has priority over allow; unresolvable/ambiguous policy denies by default (SEC-001).
- Field-level sensitivity (PII, health/allergy, documents, photos — data-dictionary.md footnote) is a separate check from object-level read/write, so a role can read an object with masked sensitive fields.
- Export, bulk action, structure change, and PII read are distinct permissions from ordinary CRUD (roles-and-permissions.md §1), independently grantable.
- Every PDP decision that denies, and every privileged/break-glass grant, is audited (SEC-007, SEC-018).
- Policy configuration (role → permission bindings, scope depth, field masks) is tenant-versioned data, not code (handoff §5: "no hard-coded tenant logic").

## Consequences

- One authorization library used by `apps/api`, `worker`, and `aiGateway` — no module hand-rolls its own permission check.
- Every new resource type must register its RBAC operations and ABAC scope predicate before its API ships; missing registration fails closed (denies), not open.
- Contract tests (`tests/contract`) must include a negative-authorization test per endpoint (ACC-MVP-003, ACC-MVP-006).

## Alternatives considered

- Pure RBAC: rejected — cannot express branch depth, ownership, or mentor-assignment scoping required by roles-and-permissions.md §1-2.
- Per-module bespoke authorization code: rejected — violates handoff §5 ("no God service, no unowned duplicated logic") and makes SEC-004 impossible to audit consistently.

## Open questions

- QST-007 (max visible branch depth and PII field set for Leader) parameterizes the ABAC scope predicate's default depth/mask and must be confirmed by Company/DPO before industrial rollout.

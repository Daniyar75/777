# ADR-0003: Authentication

Status: proposed

## Context

SEC-002 requires strong password hashing, MFA, rate limiting, safe recovery, and credential-stuffing protection. SEC-006 requires bounded sessions, refresh rotation, revoke, device list, and forced termination of privileged sessions. QST-017 (temporary answer: yes) allows one `User` to hold membership in multiple tenants with a separate session context per tenant. UI-001 requires login errors that never reveal account existence.

## Decision

- Credential authentication uses a modern memory-hard password hash (e.g., Argon2id-class algorithm), never reversible encryption.
- MFA (TOTP or equivalent) is mandatory for privileged roles (Platform owner, Company admin) and configurable-mandatory for others per tenant policy (SEC-002).
- Sessions are short-lived access tokens plus rotating refresh tokens; refresh reuse triggers session-family revocation. Users can view/revoke active devices (SEC-006).
- A `User` authenticates once at the identity level, then selects/switches an active `Tenant` membership context (`/tenants`, `/memberships`, API-002); every subsequent request carries that resolved tenant context, never a client-supplied tenant id used for authorization (feeds ADR-0002).
- Login/reset error responses are uniform regardless of whether the identifier exists (anti-enumeration, UI-001, API-001).
- Rate limiting and lockout/backoff apply to login, MFA, and reset endpoints (SEC-002, SEC-009).

## Consequences

- Identity & Tenant module (`services-or-modules/identity-tenant`) owns session issuance and membership resolution; no other module re-implements auth.
- Multi-tenant-membership requires an explicit "active tenant" concept in the session/token, adding one extra step to every login flow (tenant picker) when a user has more than one membership.
- Break-glass/support access (SEC-018) is a distinct, separately audited grant, not a side effect of normal authentication.

## Alternatives considered

- Long-lived static API tokens as the primary user auth mechanism: rejected for interactive users — insufficient revocation/rotation story for SEC-006; still available narrowly for service-to-service/integration auth (see `docs/requirements/integrations.md`, SEC-019).

## Open questions

- QST-017 is answered provisionally (yes, multi-tenant membership) but needs Product/Security confirmation before industrial launch.

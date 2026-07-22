# ADR-0010: Backend tech stack for the modular monolith

Status: accepted (implementation started)

## Context

ADR-0001..0009 fixed architecture *shape* (modular monolith, RLS tenancy, RBAC+ABAC, outbox/inbox, etc.) but deliberately left concrete tooling as a Platform Foundation (roadmap stage 1) implementation choice. Stage 1 build (`docs/mvp-backlog.md` BL-101..BL-107) is starting now, so a concrete stack must be picked to write real code.

## Decision

- **Language/runtime**: TypeScript on Node.js LTS, for both `apps/api` and (later) `apps/web`, sharing types through `packages/contracts` without a serialization boundary between frontend and backend build tooling.
- **Monorepo tooling**: pnpm workspaces (`pnpm-workspace.yaml`), one `tsconfig.base.json` extended per package.
- **HTTP framework**: Fastify, with Zod-based schema validation (`packages/contracts` exports Zod schemas reused for both runtime validation and OpenAPI-shape documentation).
- **Database**: PostgreSQL (already required by ADR-0002 for RLS). Access via Drizzle ORM + `drizzle-kit` for migrations — chosen over a heavier ORM because it maps cleanly to hand-written SQL/RLS policies and keeps the transaction/session-variable control that row-level tenant isolation needs explicit rather than hidden behind a connection pool abstraction.
- **Auth primitives**: `argon2` for password hashing (SEC-002), `jose` for JWT access tokens, opaque random refresh tokens stored hashed (SEC-006).
- **Testing**: Vitest for unit/integration tests; integration tests run against a real local PostgreSQL (not a mock), because RLS behavior is exactly the thing that must not be faked (ADR-0002, threat-model.md §2.1).
- **Module layout inside `apps/api`**: each `services-or-modules/*` folder exports an application-service surface (`index.ts`) consumed only by `apps/api`'s route wiring — no module imports another module's internal files, enforced later by an ESLint boundaries rule (`docs/testing/quality-gates.md` §1 "Module boundary lint").
- Cross-cutting engines that every module needs are their own packages, not code living inside one module: `packages/authz` (RBAC+ABAC PDP, ADR-0004), `packages/eventing` (outbox/inbox primitives, ADR-0005).
- A `governance` bounded context (`services-or-modules/governance`) is added beyond the handoff's illustrative folder list, to give `AuditLog` (data-dictionary.md ENT-050) and future `AutomationDefinition` an explicit owner per `docs/requirements/domain-model.md` §1, which lists Governance as a distinct bounded context — audit must not become a shared-ownerless table living inside `identity-tenant` (handoff §5).

## Consequences

- First runnable code is `apps/api` + `infra/database` (Drizzle schema/migrations) + `packages/authz` + `packages/eventing` + `services-or-modules/identity-tenant` + `services-or-modules/governance`.
- RLS policies are checked by real Postgres in tests from day one, not deferred to a later "hardening" pass.
- `apps/web` stack (framework choice) is deferred to the first UI-bearing stage (Stage 2, Contact card) and is not decided by this ADR.

## Alternatives considered

- Prisma ORM: rejected for this project — its RLS story requires either raw `$queryRaw` for `SET LOCAL` session variables or a middleware workaround that fights the generated client; Drizzle's thinner query builder makes the per-request `SET LOCAL app.tenant_id` step explicit and auditable in code review.
- Python/Django or FastAPI backend: rejected — no strong reason to split language between a TS frontend and a Python backend for this team size/stage, and it would prevent sharing `packages/contracts` types.

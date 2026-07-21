# Network CRM / Network OS

Multi-tenant CRM/SaaS platform for network-marketing businesses. `docs/` holds the architecture and planning baseline produced from the business requirements package in `docs/requirements/`, per the handoff instructions in `docs/requirements/claude-code-handoff.md`. Stages 1–2 (Platform Foundation + CRM Workbench, per `docs/mvp-backlog.md`) are implemented as a TypeScript/pnpm monorepo; everything past Stage 2 is still documentation only.

## Status

Architecture baseline v0.1 (draft, pending product-owner/architecture sign-off — handoff §3). Business requirements baseline v0.9 (`docs/requirements/README.md`). Stage 1 (tenant provisioning, auth, RBAC/ABAC, tenant isolation, audit log, outbox/inbox) and Stage 2 (Contact CRUD with multi-role, duplicate detection, consent lifecycle, unified timeline, Task create/complete/delegate) are implemented and tested — see `docs/mvp-backlog.md`'s per-stage "Implementation status" notes for exactly what's done and what's stubbed. See `docs/requirements/open-questions.md` — no open QST may be silently resolved by inventing business logic (handoff §8).

## Getting started (Stage 1–2 code)

Requires Node.js ≥20, pnpm, and a local PostgreSQL 16 instance.

```sh
pnpm install
pnpm -r run build

# create dev + test databases once (adjust role/db names to taste)
createdb network_crm_dev
createdb network_crm_test

# apply migrations (infra/database/migrations/*.sql)
DATABASE_URL=postgres://<user>:<pw>@localhost:5432/network_crm_dev pnpm run db:migrate
DATABASE_URL=postgres://<user>:<pw>@localhost:5432/network_crm_test pnpm run db:migrate

# run every package's test suite (integration tests need DATABASE_URL pointed at the test db)
DATABASE_URL=postgres://<user>:<pw>@localhost:5432/network_crm_test pnpm test

# run the API locally (see .env.example for required vars)
cp .env.example .env  # then edit
pnpm --filter @network-crm/api run dev
```

Tests across packages run with `--workspace-concurrency=1` (see root `package.json`) because integration tests truncate shared tables in one local Postgres database; each package also disables its own file parallelism (`vitest.config.ts`) for the same reason.

## Repository map

```text
/docs
  /requirements       Source BRD package (product-vision, business-requirements, business-rules,
                       domain-model, data-dictionary, roles-and-permissions, api-specification,
                       event-catalog, ai-requirements, security-requirements, user-stories,
                       acceptance-criteria, mvp-scope, roadmap, assumptions, open-questions,
                       traceability-matrix, integrations, non-functional-requirements)
  /architecture        system-context.md (C4), adr/ (10 architecture decisions), threat-model.md,
                        environment-deployment.md
  /api                 openapi-skeleton.yaml, error-catalog.md
  /events               asyncapi-skeleton.yaml (EVT-001..020)
  /data                mastership-matrix.md, logical-erd.md, data-classification-retention.md,
                        migration-import-rollback.md
  /testing             test-strategy.md, quality-gates.md
  /ui                  information-architecture.md, critical-flows.md
  mvp-backlog.md        Sequenced backlog (BL-101..BL-805) tracing to BR/FR/US/ACC/API/EVT/ENT;
                        see its "Implementation status" note for Stage 1 progress
/apps
  /api                 Fastify composition root — IMPLEMENTED (tenants, auth, roles, audit, contacts, tasks)
  /web                 Frontend shell — not yet implemented
/services-or-modules
  /identity-tenant     IMPLEMENTED (Stage 1): tenant provisioning, auth, role/permission admin
  /governance          IMPLEMENTED (Stage 1): audit log
  /relationship-crm    IMPLEMENTED (Stage 2): Contact CRUD/multi-role, dedupe, consent, timeline
  /work-management     IMPLEMENTED (Stage 2): Task create/read/list/complete/delegate
  /recruitment /network /commerce /customer-success
  /content-learning /engagement /intelligence /integration    not yet implemented (later stages);
                        see each folder's README for its bounded-context scope
/packages
  /contracts           IMPLEMENTED: shared Zod DTOs (tenant/identity/audit/event/contact/task/error envelope)
  /authz               IMPLEMENTED: RBAC+ABAC policy decision point (ADR-0004)
  /access              IMPLEMENTED: object-level ABAC checks shared across services-or-modules/*
  /eventing            IMPLEMENTED: transactional outbox/inbox + cross-tenant relay (ADR-0005)
  /crypto              IMPLEMENTED: password hashing (scrypt), TOTP MFA, token helpers
  /test-support        IMPLEMENTED: shared test DB helpers + entity factories
  /ui /observability    not yet implemented
/infra
  /database            IMPLEMENTED: Drizzle schema + hand-authored RLS migrations + migration runner
  /deploy /monitoring   not yet implemented
/tests                  contract/integration/e2e placeholders; security suite's Stage 1/2 coverage
                        lives with its owning package for now — see tests/security/README.md
```

## Reading order for a new contributor

1. `docs/requirements/README.md` — index and priority order of the BRD.
2. `docs/architecture/system-context.md` — C4 system context/containers/components.
3. `docs/architecture/adr/README.md` — the 10 architecture decisions this baseline rests on (9 product/architecture ADRs pending sign-off, plus ADR-0010 accepted for the Stage 1 tech stack).
4. `docs/mvp-backlog.md` — what gets built, in what order, why, and what's already done.
5. `docs/requirements/claude-code-handoff.md` — the process rules for turning this into code (module-per-task, traceability gate, what not to implement without confirmation).

## Ground rules carried from the handoff

- Development order: uncertainty → ADR/contract → schema/migration → domain tests → application/API → UI → integration/contract tests → security/access tests → observability → docs → acceptance demo.
- One task changes one bounded context, or explicitly defines an integration contract.
- No hard-coded tenant-specific business logic; configurable behavior is versioned tenant configuration.
- Items blocked on an open question (`docs/requirements/open-questions.md`) may get interfaces, feature flags, and stubs — never an invented business rule standing in for the missing decision.

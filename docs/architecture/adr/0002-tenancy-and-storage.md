# ADR-0002: Tenancy and storage model

Status: proposed

## Context

BR-009 requires logically isolated multi-tenant SaaS with White Label. `business-requirements.md` §10 compares shared-DB, schema-per-tenant, DB-per-tenant and hybrid models. ASM-014 recommends shared DB + schema with mandatory `tenant_id` and RLS-equivalent protection for MVP; enterprise tenants may need stronger isolation. RISK-002 (tenant isolation breach) is rated critical. SEC-003 requires tenant_id enforcement at API, service, and database layers.

## Decision

- MVP: single database, single schema, **every business table carries a non-nullable, immutable `tenant_id`** (BRULE-TENANT-001) enforced by database Row-Level Security (or the chosen database's equivalent row-authorization mechanism) in addition to application-layer checks — defense in depth, not either/or.
- The application never accepts `tenant_id` as untrusted client input for authorization decisions; it is resolved from the authenticated session/membership context on every request and injected into the RLS session variable and repository calls.
- `tests/security` must include automated cross-tenant-read/write attempts for every tenant-scoped entity as a release gate (ACC-MVP-004).
- Enterprise/regulated tenants may be provisioned on an isolated database (schema-per-tenant is explicitly **not** recommended as the general model — business-requirements.md §10 flags it as not recommended due to migration complexity without materially better isolation than RLS). This requires the provisioning/migration tooling in `infra/database` to be tenant-topology-aware from the start, even though only the shared model ships first.
- Time is stored in UTC; display converts to IANA tenant/user timezone (ASM-015, NFR-I18N-001).

## Consequences

- Lower initial infra cost, straightforward migrations, matches ASM-014.
- Every new table/migration must include `tenant_id` + RLS policy in the same migration, checked by CI (quality gate).
- A single noisy/large tenant can affect others until per-tenant resource governance is added; acceptable for MVP scale target (NFR-SCALE-001: 10 tenants, 10k users/tenant, 100k contacts/tenant) but must be revisited before enterprise SLA (NFR-AVAIL-001 industrial tier).
- Break-glass platform-support access (SEC-018) must go through an explicit, audited, time-boxed path — never a raw cross-tenant query.

## Alternatives considered

- Schema-per-tenant: rejected as base model — no materially stronger isolation than RLS for the risk it mitigates, while multiplying migration/connection complexity (business-requirements.md §10).
- DB-per-tenant from day one: rejected for MVP — cost/ops overhead disproportionate before pilot; reserved for enterprise/regulated tenants (hybrid target model, roadmap stage 10).

## Open questions

- QST-001 (data controller/operator per country) and QST-016 (contractual RPO/RTO/SLA) affect whether specific tenants require dedicated storage or region pinning before pilot.

# Test strategy

Status: draft, required before implementation starts (handoff §3.7). Ties directly to `docs/requirements/acceptance-criteria.md` and `docs/requirements/traceability-matrix.md`, which require every ACC to carry a test ID and every test to state which rule/scenario version it targets.

## 1. Test levels and what each one owns

| Level | Location | Owns | Runs against |
|---|---|---|---|
| Unit | inside each `services-or-modules/*` package | Domain rules, state machines, formulas (e.g., BRULE-REPEAT-002 expected-end calculation), PDP scope predicates | In-process, no DB |
| Integration | `tests/integration` | Cross-module application flow within the monolith (e.g., OrderReceived → CustomerJourney created), repository/RLS behavior | Real DB (ephemeral per-run schema), no HTTP |
| Contract | `tests/contract` | Every `docs/api/openapi-skeleton.yaml` endpoint's request/response/error shape and negative-authorization case; every `docs/events/asyncapi-skeleton.yaml` message's schema | Provider verifies against the published contract; consumers verify against the same fixtures |
| E2E | `tests/e2e` | The three MVP cross-cutting scenarios (UC-001..004) end to end through the UI/API together, plus the critical flows in `docs/ui/critical-flows.md` | Deployed test environment |
| Security | `tests/security` | Tenant isolation, IDOR, break-glass audit, consent-suppression, webhook signature/idempotency — one test per abuse case in `docs/architecture/threat-model.md` §2 | Deployed test environment or integration-level harness |
| Performance | ad hoc under `tests/e2e` + load-test tooling in `infra/monitoring` | NFR-PERF-001/002/003 SLOs, large-tree benchmark (roadmap stage 3 exit criterion) | Load-test environment with representative tree shape (NFR §"дополнительные требования" — real tree shape, not average record count) |

## 2. Mapping BR → test obligation

Per `docs/requirements/traceability-matrix.md` completeness rule: a Must-scope story is not release-ready unless its BR has at least one FR, US, and ACC linked, its ACC has a test ID, and that test states the rule/scenario version it exercises. This repo's CI must be able to answer, for every `ACC-*` ID: "which test file asserts this," mechanically (see quality-gates.md §3).

## 3. Required test scenarios per story (acceptance-criteria.md "Общие критерии")

Every user story's test suite must include, at minimum:
1. Positive/happy path.
2. At least one alternative/exception path named in the story.
3. Permission-denied path (PDP deny).
4. Validation-failure path.
5. Concurrent-update path (`VERSION_CONFLICT`) for any mutable aggregate.
6. Retry/idempotency path for any create/transition/payment/webhook/import operation.

A story is not "done" (handoff §5, mvp-scope.md ACC-MVP-002/003) if any of these six is missing, regardless of whether the happy path passes.

## 4. Data and environment for tests

- Test tenants are synthetic and excluded from production-analytics aggregation by construction (they are never provisioned in the production tenant table); this is a provisioning-time control, not a runtime `is_test` flag scattered through query logic, to avoid it being forgotten in one query (BR analytics note: "Единицы расчета должны исключать soft-deleted тестовые данные").
- Contract and integration tests use `packages/test-support` factories that always set `tenant_id`, so no test can accidentally assert against an ungoverned global table.
- AI use cases are tested against a fixed, versioned eval set with no uncontrolled PII (`docs/requirements/ai-requirements.md` §4); a prompt/model change requires a regression run against that eval set before rollout, gating merge for AI-touching changes.

## 5. Non-functional verification

- Backup/restore: tested on a defined cadence, not assumed from a successful backup job alone (NFR-DR guidance: "успешный backup без restore test не считается подтверждением").
- Capacity/load: executed against a realistic tree shape and timeline volume before enterprise rollout (roadmap stage 8/10 exit criterion), not only average record counts.
- Accessibility: WCAG 2.1 AA target for MVP critical flows (NFR-A11Y-001), checked via automated axe-type scanning plus manual keyboard-navigation pass on the flows in `docs/ui/critical-flows.md`.

## 6. What this strategy explicitly does not decide yet

Concrete tooling (test runner, contract-test framework, load-test tool) is an implementation choice made per `apps/api`/`apps/web` stack selection during Platform Foundation (roadmap stage 1); this document fixes *what* must be tested and *where* it lives, not the toolchain.

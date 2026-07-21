# Quality gates

Status: draft CI/merge policy, required before implementation starts (handoff §3.7, §9 traceability gate).

## 1. Merge-blocking gates (every PR)

| Gate | Checks | Source of truth |
|---|---|---|
| Module boundary lint | No module under `services-or-modules/*` imports another module's repository/ORM/internal types directly; cross-module calls only through a declared port or an event | ADR-0001 |
| Tenant-column lint | Every new/changed table migration includes `tenant_id` (non-nullable) and an RLS-equivalent policy in the same migration | ADR-0002 |
| ID format + reference check | Every BR/FR/BRULE/US/ACC/API/EVT/ENT ID referenced in code comments, PR description, or docs resolves to a real entry in `docs/requirements/*` | handoff §9, traceability-matrix.md |
| Traceability completeness | Any new/changed Must-scope story updates `docs/requirements/traceability-matrix.md`: BR↔FR↔US↔ACC↔API/EVT↔ENT↔Test all linked | traceability-matrix.md "Правило полноты" |
| Negative-authorization test present | Every new/changed API endpoint has at least one test asserting `PERMISSION_DENIED`/`TENANT_MISMATCH` | ADR-0004, threat-model.md §2.2 |
| Idempotency test present | Every new/changed create/transition/payment/webhook/import endpoint has a repeated-call-same-key test | BR-020, api-specification.md §4 |
| No undocumented error code | Every error code returned by new/changed code exists in `docs/api/error-catalog.md` | error-catalog.md §4 |
| Audit coverage | Every new mutation of role, structure, order, consent, integration config, export, break-glass, or AI decision writes an `AuditLog` entry in the same transaction as the change | SEC-007 |
| Secret scan | No credential/token pattern in diff | SEC-005, SEC-015 |
| Six-scenario story checklist | PR implementing a `US-*` story links tests for: happy path, named alternative/exception, permission-denied, validation, concurrent-update, retry/idempotency | test-strategy.md §3 |

## 2. Release gates (MVP go/no-go, mirrors mvp-scope.md §4)

Reproduced here as the enforceable checklist (source: `docs/requirements/mvp-scope.md` ACC-MVP-001..010):

- [ ] All three MVP cross-cutting scenarios (UC-001/UC-002, leader branch-review flow) pass E2E in a clean test tenant with no manual DB edits.
- [ ] No open blocker/critical defect; every open high has an agreed workaround.
- [ ] Automated tests cover authorization, tenant isolation, orders, funnel transitions, and permissions.
- [ ] Tenant-isolation and branch-scope isolation tests pass.
- [ ] Import supports dry-run, an error report, and a safe repeat run.
- [ ] Order/structure/permission/consent/AI-recommendation changes are all audited.
- [ ] A sample of analytics metrics reconciles against a manually computed control sample.
- [ ] Runbooks exist for backup restore, integration failure, and AI kill switch.
- [ ] An admin can configure funnel stages and follow-up scenarios without a code change.
- [ ] API docs, data model docs, and user-facing instructions are current as of the release commit.

## 3. Mechanical traceability check (what CI actually runs)

CI parses:
1. `docs/requirements/traceability-matrix.md` rows into a BR→FR→US→ACC→API→ENT→EVT→Test graph.
2. Every `ACC-*` ID must appear with at least one associated test file/function name following the `T-<AREA>-<NAME>-<NNN>` convention already used in the matrix.
3. A PR that adds/modifies a Must-scope story must not merge if its story's row is missing a required column value (`—` is only acceptable where the matrix already shows `—` for a genuinely not-applicable column, e.g., BR-008 has no EVT).

This is a **format and existence** check, not a semantic one — manual review still verifies the test actually proves the acceptance criterion, per handoff §9 ("Ручной review проверяет смысловую, а не только синтаксическую трассировку").

## 4. Definition of Done (per module task template, handoff §6)

A module/story is not done without: migration + rollback/forward note, domain tests, application/API tests, UI states (loading/empty/permission-denied/validation-error/transient-error/retry) where applicable, integration/contract tests, security/access tests, telemetry, and updated docs — matching handoff §5's closing rule verbatim.

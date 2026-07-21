# MVP backlog

Status: draft sequencing of `docs/requirements/mvp-scope.md` and `docs/requirements/roadmap.md` into ordered, dependency-aware backlog items, each traced to BR/FR/US/ACC/API/EVT/ENT per handoff §9. This is the working backlog Claude Code (or any implementer) should pull from; it does not replace `docs/requirements/traceability-matrix.md`, it sequences it.

Every item's Definition of Done is `docs/testing/quality-gates.md` §4 (migration+rollback, domain/application/API tests, UI states, integration/contract tests, security/access tests, telemetry, docs) plus the item's own ACC IDs passing.

## Stage 1 — Platform Foundation (roadmap stage 1)

| Item | US | Depends on | BR/FR | ENT | API | Exit |
|---|---|---|---|---|---|---|
| BL-101 Tenant provisioning | US-PLATFORM-001 | — | BR-009, FR-CORE-001 | ENT-001, ENT-002 | API-002 | Tenant created with rollback on incomplete provision |
| BL-102 Auth + session (ADR-0003) | — | BL-101 | SEC-002, SEC-006 | ENT-003 | API-001 | Login/MFA/refresh/revoke pass security tests |
| BL-103 RBAC+ABAC PDP (ADR-0004) | US-ADMIN-001 | BL-102 | SEC-001, SEC-004, FR-CORE-001 | ENT-004, ENT-005 | API-003 | Negative-authorization tests pass for a seed role set |
| BL-104 Tenant isolation (RLS) (ADR-0002) | — | BL-101, BL-103 | SEC-003, BRULE-TENANT-001 | all tenant tables | — | `tests/security` cross-tenant probe fails to leak (ACC-019) |
| BL-105 Audit log | US-AUDIT-001 | BL-103 | SEC-007, SEC-008, BR-010 | ENT-050 | API-024 | Append-only, immutable, correlation-searchable (ACC-020) |
| BL-106 Outbox/inbox event backbone (ADR-0005) | — | BL-101 | BR-020 | — | — | At-least-once delivery + idempotent consumer proven in integration test |
| BL-107 Base reference-data admin | US-ADMIN-002 | BL-103 | FR-ADMIN-001 | — | API-003 | Admin can version a reference config without code change |

## Stage 2 — CRM Workbench (roadmap stage 2)

| Item | US | Depends on | BR/FR | ENT | API/EVT | Exit |
|---|---|---|---|---|---|---|
| BL-201 Contact CRUD + multi-role | US-CONTACT-001 | BL-104 | BR-001, FR-CONTACT-001/002 | ENT-006, ENT-007 | API-004, EVT-001 | ACC-001, ACC-002 |
| BL-202 Duplicate detection (ADR-0007) | US-CONTACT-001 | BL-201 | BRULE-CONTACT-003, FR-CONTACT-004 | ENT-006 | API-004 | ACC-001 |
| BL-203 Contact import/export | US-CONTACT-002 | BL-201 | FR-CORE-006/007 | ENT-006 | API-004 | ACC-003, ACC-MVP-005 |
| BL-204 Consent lifecycle | US-CLIENT-003 | BL-201 | SEC-011, BRULE-CONSENT-001/002 | ENT-048 | API-005, EVT-018 | ACC-018 |
| BL-205 Timeline/unified history | — | BL-201 | FR-CONTACT-003 | ENT-016, ENT-017 | API-005 | Cross-context history renders masked per scope |
| BL-206 Merge/dedupe resolution | US-CONTACT-003 | BL-202 | FR-CONTACT-005 | ENT-006 | API-004 | Financial records excluded from auto-merge |
| BL-207 Tasks + calendar | US-TASK-001 | BL-103 | FR-TASK-001, FR-CALENDAR-001 | ENT-018, ENT-019 | API-015 | Delegation stays in scope (BRULE-TASK-001) |

## Stage 3 — Recruitment & Network (roadmap stage 3)

| Item | US | Depends on | BR/FR | ENT | API/EVT | Exit |
|---|---|---|---|---|---|---|
| BL-301 Funnel/stage configuration | US-ADMIN-002 | BL-107 | FR-FUNNEL-001/002 | ENT-021, ENT-022 | API-006 | ACC-004 |
| BL-302 Opportunity + atomic transitions | US-PARTNER-001 | BL-301, BL-201 | FR-FUNNEL-003/004, BRULE-FUNNEL-001..004 | ENT-023 | API-006, EVT-002 | ACC-005 |
| BL-303 Sponsor/mentor relations + cycle guard | US-ADMIN-003 | BL-201 | BR-003, BR-019, FR-NETWORK-004/005 | ENT-010, ENT-011, ENT-012 | API-008, EVT-004 | ACC-007 |
| BL-304 Partner registration (UC-001) | US-PARTNER-002 | BL-302, BL-303 | BR-006 | ENT-010 | API-007, EVT-003 | ACC-006, idempotent on repeat |
| BL-305 Network tree/branch read model (ADR-0008) | US-LEADER-001 | BL-303 | FR-NETWORK-002/003/006/007 | ENT-013 | API-008 | Lazy load ≤2s first screen (NFR-PERF-003) |
| BL-306 Branch scope/masking (ABAC depth) | US-LEADER-001 | BL-103, BL-305 | BRULE-NETWORK-005 | — | API-008 | ACC-008 |
| BL-307 External structure sync adapter | US-ADMIN-003 | BL-303 | FR-NETWORK-001 | ENT-011, ENT-013 | API-008 | Dry-run + quarantine invalid rows |
| BL-308 Onboarding route baseline | US-NEWBIE-001, US-MENTOR-001 | BL-304 | BR-006, FR-LMS-002 | ENT-043 | API-018, EVT-013 | ACC-MVP-001 onboarding leg |

## Stage 4 — Commerce (roadmap stage 4)

| Item | US | Depends on | BR/FR | ENT | API/EVT | Exit |
|---|---|---|---|---|---|---|
| BL-401 Catalog (product/category/price/docs) | — | BL-107 | FR-PRODUCT-001..004 | ENT-024..028 | API-010 | Workflow draft→approved enforced |
| BL-402 Product recommendation (approved-source gated) | US-CLIENT-001 | BL-401, BL-201 | FR-REC-001..003, BRULE-PRODUCT-001 | ENT-028 | API-011 | Blocks without approved source (FR-REC-003) |
| BL-403 Order creation + price/tax snapshot | US-ORDER-001 | BL-401, BL-201 | BR-028, FR-ORDER-001/002 | ENT-029, ENT-030 | API-012, EVT-005 | ACC-009 |
| BL-404 Order state machine + payment webhook | — | BL-403 | FR-ORDER-004/005, BRULE-ORDER-002/003 | ENT-031 | API-012/013, EVT-006 | Idempotent webhook, no double-apply |
| BL-405 Delivery + return | — | BL-404 | FR-ORDER-006/008 | ENT-032, ENT-033 | API-013, EVT-007 | Return qty ≤ fulfilled qty |
| BL-406 Order-received trigger | — | BL-404 | FR-ORDER-009, BRULE-ORDER-004 | — | EVT-008 | Fires follow-up exactly once (ACC-011) |

## Stage 5 — Customer Success (roadmap stage 5)

| Item | US | Depends on | BR/FR | ENT | API/EVT | Exit |
|---|---|---|---|---|---|---|
| BL-501 Follow-up scenario config | — | BL-401 | FR-FOLLOW-001/002 | ENT-035, ENT-036 | API-014 | Versioned, priority-ordered |
| BL-502 CustomerJourney instantiation | US-FOLLOW-001 | BL-406, BL-501 | BRULE-FOLLOW-001, FR-FOLLOW-003 | ENT-034 | API-014, EVT-009 | ACC-011 idempotent on duplicate delivery |
| BL-503 Complaint/adverse-reaction case | US-FOLLOW-002 | BL-502 | BR-004, BRULE-FOLLOW-002, UC-004 | ENT-052 | API-014, EVT-019 | ACC-012, marketing suspension proven |
| BL-504 Expected-end + repeat forecast | US-REPEAT-001 | BL-502 | FR-REPEAT-001..004, BRULE-REPEAT-002 | ENT-034 | EVT-011 | ACC-013 |
| BL-505 Repeat order draft | US-ORDER-002 | BL-504, BL-403 | ASM-006 | ENT-029 | EVT-012 | ACC-014, no auto-payment |

## Stage 6 — Engagement (roadmap stage 6)

| Item | US | Depends on | BR/FR | ENT | API/EVT | Exit |
|---|---|---|---|---|---|---|
| BL-601 Content/knowledge library + workflow | US-CONTENT-001 | BL-107 | FR-CONTENT-001/002 | ENT-038, ENT-039 | API-017 | Only approved/current version servable |
| BL-602 Notifications + preferences | US-NOTIF-001 | BL-102 | FR-NOTIF-001..003 | ENT-046 | API-019 | Mandatory service notices not fully disableable |
| BL-603 Events baseline | US-EVENT-001 | BL-201 | FR-EVENT-001 | ENT-019, ENT-020 | API-016, EVT-016 | Registration/attendance recorded |
| BL-604 Dashboard/KPI read models (ADR-0008) | — | BL-305, BL-403 | FR-DASH-001..004, BR analytics §9 | ENT-054 | API-020 | KPI shows source/as_of/definition (BRULE-ANALYTICS-001) |
| BL-605 Metric reconciliation job | — | BL-604 | ACC-MVP-007 | ENT-054 | — | Sample metrics match manual control |

## Stage 7 — AI MVP (roadmap stage 7)

| Item | US | Depends on | BR/FR | ENT | API/EVT | Exit |
|---|---|---|---|---|---|---|
| BL-701 AI Policy Gateway (ADR-0009) | — | BL-103 | AI-001..004, AI-011..013 | ENT-047 | API-021 | Kill switch + quota proven |
| BL-702 Contact summary + day plan | US-AI-001 | BL-701, BL-205, BL-207 | AI-003, AI-006 | ENT-047 | API-021, EVT-017 | ACC-015 |
| BL-703 Message draft (consent-gated) | US-AI-002 | BL-701, BL-204, BL-601 | AI-004, AI-009 | ENT-047 | API-021 | ACC-016, ACC-017 |
| BL-704 KB Q&A with citations | — | BL-701, BL-601 | AI-008 | ENT-047 | API-021 | Refuses without source |
| BL-705 Weekly report | US-AI-003 | BL-701, BL-604 | BR-015 | ENT-047 | API-021 | Cites metrics, no hallucinated numbers |

## Stage 8 — Pilot & hardening (roadmap stage 8)

| Item | Depends on | Exit |
|---|---|---|
| BL-801 External adapters (INT-001..018 as contracted per pilot tenant) | Stage 3/4 items for the relevant domain | Reconciliation report (integrations.md §2) clean |
| BL-802 Migration/import tooling hardening | BL-203, BL-307 | Dry-run + safe repeat run for every import path |
| BL-803 Support runbooks (backup restore, integration failure, AI kill switch) | all prior stages | ACC-MVP-008 |
| BL-804 DR/load/security test pass | all prior stages | `docs/testing/test-strategy.md` §6 executed |
| BL-805 Pilot sign-off | BL-801..804 | All `docs/testing/quality-gates.md` §2 boxes checked |

## Sequencing notes

- Stage 3 (Recruitment & Network) and Stage 4 (Commerce) can proceed in parallel once Stage 2 (Contact) is done — they share only the Contact aggregate, not each other's state, matching the bounded-context isolation in ADR-0001.
- Stage 7 (AI) intentionally starts only after the modules it summarizes/drafts against (Contact timeline, Tasks, Content, Analytics) exist, per AI-006 ("AI must disclose insufficient data, not invent it") — there is nothing to safely summarize before then.
- Every item that touches a QST-blocked area (BL-303/304/307 → QST-005/006; BL-401 pricing → QST-004; BL-701 → QST-014) ships with the interface/stub-only constraint from handoff §8 until that QST resolves.

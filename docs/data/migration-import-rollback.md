# Migration, import, and rollback plans

Status: draft, required before implementation starts (handoff §3.10). Covers two distinct concerns that must not be conflated: **schema migration** (changing the CRM's own database structure as the product evolves) and **data import/reconciliation** (bringing external/legacy data — contacts, structure, catalog — into a tenant).

## 1. Schema migration policy

- Migrations are forward-only in normal operation; every migration that changes or removes a column/table ships with a written rollback or forward-fix note in the same PR (NFR-MAINT-001, handoff §5 closing rule) — "we will forward-fix by X" is an acceptable note when a clean rollback is impractical, but the note must exist.
- A migration that adds a new tenant-scoped table must add `tenant_id` (non-nullable) and its RLS-equivalent policy in the same migration (ADR-0002); this is enforced by the CI lint in `docs/testing/quality-gates.md` §1.
- Destructive migrations (drop column/table) are two-phase: (1) stop writing/reading the field in application code and ship, (2) drop it in a later migration once confirmed unused — never a single-step drop in the same release as the code change that stops using it, so a rollback of the code deploy does not hit a missing column.
- Config/reference-data changes that are themselves versioned business objects (Funnel, FollowUpScenario, AutomationDefinition, ContentItem) are **not** schema migrations — they go through their own versioning workflow (draft→active/approved→retired) and never mutate history for already-referenced versions (ACC-004, BRULE-CONTENT-001).

## 2. Import (bringing external/legacy data into a tenant)

Applies to Contact import (FR-CORE-006, US-CONTACT-002), network-structure import (US-ADMIN-003), and any INT-* batch reconciliation (`docs/requirements/integrations.md`).

### 2.1 Required stages, in order

1. **Column/field mapping** — user or config maps source columns to CRM fields; unmapped required fields block progression.
2. **Dry-run validation** — runs the full validation and business-rule set (duplicate detection, cycle detection, uniqueness) against the batch **without writing anything**, and produces a per-row report: would-apply / would-reject with reason (ACC-003, ACC-007).
3. **Correction** — user fixes source data or accepts flagged duplicates/exceptions through an explicit decision (never a silent skip).
4. **Confirm/apply** — writes only the rows that passed (or were explicitly accepted); the run is an `AsyncJob` (see `docs/api/openapi-skeleton.yaml`) with `queued/running/partial/succeeded/failed` status, never reported "succeeded" for a partial result (ACC-MVP-005, `docs/requirements/integrations.md` §2: "Частичный sync не маркируется успешным").
5. **Safe repeat** — re-running the same batch (same source identifiers) after a partial failure must not create duplicates; idempotency is keyed on the source's stable identifier (external_id / normalized contact identifier), not on job run number (ACC-006 pattern extended to import).

### 2.2 Per-domain rules that import must not bypass

- Contact import still runs duplicate detection (BRULE-CONTACT-003) — bulk load is not an exemption.
- Structure import still runs cycle/self-sponsorship/one-active-sponsor checks per row; a row that would create a cycle is quarantined into the error report, not silently dropped or silently applied (ACC-007, RISK-001).
- Catalog/price import respects the mastership matrix (`docs/data/mastership-matrix.md`) — if the tenant has an external catalog master connected, manual/CSV import of a mastered field is rejected with `MASTER_DATA_READ_ONLY`, not silently accepted and later overwritten by the next sync.
- Rank/volume import is append-only (BR-021) — importing a corrected historical value creates a new `RankHistory` entry with a reason, it never overwrites a prior period in place.

### 2.3 Reconciliation for ongoing (non-one-time) integrations

Per `docs/requirements/integrations.md` §2: every scheduled/event-driven sync computes received/applied/rejected counts, max source timestamp, and a checksum, and surfaces a discrepancy list. This is the same machinery as one-time import (§2.1 above) run on a schedule — it is not a separate code path, to avoid the two drifting apart.

## 3. Rollback scenarios and what "rollback" means per case

| Scenario | What rolls back | What does not |
|---|---|---|
| Bad schema migration deployed | Schema change (via its documented rollback/forward-fix note, §1) | Any data already written under the new schema in production, unless the migration itself is purely additive |
| Bad import batch applied (should have stayed dry-run) | The specific batch's created/updated rows, identified via the batch's `job_id`/correlation stamp on each affected record | Records the batch legitimately updated that were also independently modified afterward by a user — those are flagged for manual review, not blindly reverted |
| Bad automation activation causing wrong side effects | The automation is disabled via its kill switch (FR-AUTO-003); affected Tasks/Notifications it created are identifiable via `AutomationDefinition` reference for manual cleanup | Domain events already published/consumed by other systems are not un-published — downstream compensating action is a separate, explicit step |
| Bad structure sync applied | Reverting to the last known-good snapshot is possible because `NetworkNode`/`SponsorRelation` are versioned, not overwritten in place (ENT-011/013) — a "revert" is really "create a new version pointing back," preserving full history | The historical fact that the bad version was briefly active is not erased — it remains in the audit trail (SEC-008) |

A rollback is never a raw `DELETE`/`UPDATE` against production data outside these documented, batch-identified paths — every corrective action goes through the same authorized, audited write path as normal operation (SEC-007), just with a "correction" reason attached.

## 4. What this document does not decide

Concrete migration tooling and CI wiring are implementation choices for Platform Foundation (roadmap stage 1); this document fixes policy (what must be true of every migration/import/rollback), not the tool that enforces it.

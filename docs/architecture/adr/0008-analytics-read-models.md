# ADR-0008: Analytics and read models

Status: proposed

## Context

KPI-001..018 (business-requirements.md §9) require dashboards, drill-down, and reconciliation against a control sample (ACC-MVP-007). BR-014/BR-023/BRULE-ANALYTICS-001 require every metric to show its source, as-of time, and definition, and to distinguish official (externally sourced) from CRM-calculated figures. FR-ANALYTICS-001..003 require filtered/permission-scoped queries and re-checked export rights.

## Decision

- Analytics is served from **`MetricSnapshot`** read models (ENT-054) computed asynchronously from domain events and scheduled aggregation jobs, never by ad-hoc heavy aggregate queries against live transactional tables inside a user-facing request (protects NFR-PERF-001 for unrelated CRUD traffic).
- Every `MetricSnapshot` carries `metric id, dimensions, period, value, source, as_of` (data-dictionary.md ENT-054) so the UI can always render BRULE-ANALYTICS-001's required definition/source/freshness disclosure.
- Metrics sourced from an external master (e.g., official rank/volume via INT-001/INT-007) are stored with `source = integration:<name>` and are never silently recalculated by the CRM; CRM-calculated proxies (e.g., rule-based activity risk, KPI-016) are clearly labeled as calculated, not official (BR-014).
- Every analytics query re-applies row/field-level authorization at query time (FR-ANALYTICS-003), even though the underlying snapshot was pre-aggregated — aggregation must not become an authorization bypass (e.g., a branch-scoped rollup must not leak counts derived from records outside the requester's scope).
- Export re-validates permissions and is separately audited (SEC-014).
- A monthly/periodic reconciliation job compares a sample of `MetricSnapshot` values against a direct recomputation to catch aggregation drift (ACC-MVP-007).

## Consequences

- Requires an async aggregation pipeline (part of the `worker` container) before any KPI dashboard ships — cannot be deferred to "just query the DB" once volume grows.
- Every new KPI added to the catalog needs its dimensions, filters, and access scope registered up front, matching FR-ANALYTICS-001's requirement that KPI-001..018 all support filters and drill-down into an authorized subset.

## Alternatives considered

- Live aggregate queries per dashboard load: rejected for anything beyond the smallest MVP pilot tenant — does not scale to NFR-SCALE-001 targets and risks starving interactive CRUD latency (NFR-PERF-001).

## Open questions

- QST-012 (how personal/group volume and activity are calculated) directly determines which KPI-012/013/014/015/016 become CRM-calculated vs. imported; until resolved, these snapshots must import externally computed values rather than invent a formula (handoff §8).

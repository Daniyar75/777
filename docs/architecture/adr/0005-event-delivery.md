# ADR-0005: Event delivery — transactional outbox / inbox

Status: proposed

## Context

`docs/requirements/event-catalog.md` defines 20 domain events (EVT-001..020) with a mandatory envelope (`event_id`, `event_type`, `schema_version`, `occurred_at`, `tenant_id`, `aggregate_type/id/version`, `correlation_id`, `causation_id`, `producer`) and states publication must be transactional-outbox based, consumption inbox/dedup based, with retry/DLQ. BRULE-AUTO-001 requires exactly-once *effect* (not exactly-once delivery) for automations. NFR-REL-001 requires at-least-once delivery with idempotent effects for MVP, outbox/inbox + DLQ + replay for the industrial tier. RISK-009 flags duplicate automations/events as a concrete risk.

## Decision

- Every state-changing write that must notify other modules writes its domain row(s) and an outbox row in the **same database transaction**. A separate relay process/thread publishes outbox rows to the broker at-least-once and marks them dispatched.
- Every consumer maintains an inbox table keyed by `(event_id, consumer_name)` and is idempotent: reprocessing the same `event_id` is a no-op after the first successful effect (BRULE-AUTO-001).
- Ordering is guaranteed only within one aggregate stream; consumers must tolerate out-of-order delivery across aggregates and use `aggregate_type/id/version` to detect staleness (event-catalog.md, closing note).
- Schema evolution is backward-compatible within a `schema_version`; a breaking change ships as a new event type/major version, both versions supported during a deprecation window (NFR-API-001 analog for events).
- Failed consumption after policy-defined retries with backoff+jitter lands in a per-consumer DLQ with a documented manual/automatic replay runbook (`docs/requirements/integrations.md` §1 applies the same pattern to external integrations).
- Automations built on the event-driven "trigger → conditions → actions" constructor (BR-030) additionally enforce recursion depth and rate limits with a kill switch (BRULE-AUTO-002, FR-AUTO-003) to prevent event-triggered cycles.

## Consequences

- Requires an outbox table per module (or a shared outbox table partitioned by module) plus a relay component (`worker` container in system-context.md).
- Consumers must be written idempotent-first; this is a non-negotiable code-review gate, not a best-effort convention.
- DLQ monitoring and replay tooling must exist before any automation ships to production (ACC-MVP items depend on this).

## Alternatives considered

- Direct synchronous cross-module calls for state propagation: rejected — couples module deployability, violates ADR-0001's port/event boundary, and cannot express NFR-REL-001's at-least-once + idempotent-effect requirement cleanly.
- Best-effort fire-and-forget publish (no outbox): rejected — risks event loss on crash between commit and publish, directly causing the duplicate/missing-automation failure mode RISK-009 warns about.

## Open questions

None blocking; broker product choice (e.g., managed queue vs. log-based broker) is an implementation detail to be resolved during Platform Foundation (roadmap stage 1) based on the chosen cloud/infra, not a business decision.

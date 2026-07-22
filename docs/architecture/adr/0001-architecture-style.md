# ADR-0001: Architecture style — modular monolith with bounded contexts

Status: proposed

## Context

`docs/requirements/domain-model.md` defines 12 bounded contexts (Identity & Tenant, Relationship CRM, Recruitment, Network, Commerce, Customer Success, Work Management, Content & Learning, Engagement, Intelligence, Integration, Governance). RISK-005 flags "MVP too broad" as a top delivery risk. ASM-013 recommends starting as a modular monolith. Handoff §1 mandates that context boundaries be enforced in code and data from day one regardless of deployment topology.

## Decision

Ship one deployable backend (`apps/api`) that composes the modules under `services-or-modules/*` in-process. Each module:

- owns its own tables (or a clearly namespaced schema) — no other module writes to it directly;
- exposes an application-layer port (use cases) as its only inbound interface for other modules;
- communicates state changes to other modules exclusively via the domain event catalog (`docs/requirements/event-catalog.md`) through the transactional outbox, not synchronous in-process calls that skip the port;
- is deployable as a separate service later without changing its public port or event contracts.

A module is only split into an independent service when justified by measured load, an independent release cadence, or risk/compliance isolation — never speculatively (handoff §1).

## Consequences

- Fast initial delivery, single transaction boundary for same-module invariants, simple ops for MVP/pilot (roadmap stage 1-8).
- Cross-module invariants (e.g., Order received → CustomerJourney started) are eventually consistent via events, not a single DB transaction; this is intentional and matches BR-020/BRULE-AUTO-001 (idempotent, at-least-once).
- Requires discipline: a lint/CI rule must forbid a module importing another module's repository/ORM types directly (see `docs/testing/quality-gates.md`).
- "God service" and shared ownerless tables are explicitly disallowed (handoff §5).

## Alternatives considered

- Microservices from day one: rejected — premature given RISK-005 and unproven load; ops overhead too high pre-pilot.
- Single unstructured monolith (no enforced module boundaries): rejected — history shows this collapses into a God service and blocks later extraction.

## Open questions

None blocking; QST items affecting individual modules are tracked in the owning module's docs.

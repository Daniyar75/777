# ADR-0007: Search

Status: proposed

## Context

FR-CONTACT-008 requires contact search by name, normalized channel, tags, and identifiers with masking applied. FR-DASH/UI-004 require saved views and filters. NFR-PERF-002 targets p95 ≤ 2s at pilot volume, ≤ 1s at target index size industrially. UI-010/UI-015 require catalog and content search. NFR-SCALE-001 sets the MVP sizing floor (10 tenants, 100k contacts/tenant).

## Decision

- Primary transactional queries (list/filter with moderate cardinality) are served directly from the relational database with tenant-scoped, permission-aware indexes; a dedicated search index is introduced only where full-text/fuzzy matching or cross-field ranking is required (contact name/alias matching for dedupe candidates, content/knowledge base full-text, product catalog search).
- The search index is a **read model**, never the source of truth: it is rebuilt/kept current from domain events (EVT-001 ContactCreated, ContentItem published, Product activated, etc.) via the same outbox/inbox mechanism as ADR-0005, and can be safely rebuilt from the database at any time.
- Every search query is executed with the requester's tenant and ABAC scope already applied as a filter, not as a post-filter on results (avoids leaking result counts/existence across tenant or scope boundaries — ACC-019 analog).
- Sensitive/PII fields are excluded from the search index payload where the index engine cannot enforce field-level masking per requester; masking is applied by re-fetching authorized fields from the database for display.

## Consequences

- Two query paths to keep in sync (DB direct-query vs. search-index) for entities that need full-text search; acceptable because the index is disposable/rebuildable and the event-driven sync reuses infrastructure already required by ADR-0005.
- Search index choice (e.g., a Postgres-native full-text/trigram approach vs. a dedicated search engine) is an implementation decision made during CRM Workbench (roadmap stage 2) based on measured contact-dedupe and content-search needs, not fixed here.

## Alternatives considered

- Application-side full scan/filter for all search: rejected — fails NFR-PERF-002 at target contact volume and duplicate-detection needs (BRULE-CONTACT-003) which require fuzzy/normalized matching.
- Search index as system of record: rejected — violates "index is a read model" discipline used throughout the platform (ADR-0002/0005) and would require the index engine to enforce tenant/ABAC security itself, duplicating ADR-0004.

## Open questions

None blocking; index technology selection deferred to implementation (see Consequences).

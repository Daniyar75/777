# Mastership matrix

Status: draft, per-entity/field mastership must be confirmed against the real tenant's integration landscape before industrial launch (QST-004). "Master" = authoritative source; the CRM may still store a synced copy for query performance, but must never accept a manual write to a field it does not master while in external mode (BRULE-NETWORK-004, FR-PRODUCT-004).

Mode is tenant-configurable per entity: **internal** (CRM is master, manual edit allowed) or **external** (named system is master, CRM is a synced read-mostly copy; manual edit blocked except a logged emergency-override procedure).

## 1. Identity & CRM-owned entities (always internal — CRM is master)

| Entity (ENT) | Master | Notes |
|---|---|---|
| Tenant, User, Role, Permission (ENT-001..005) | CRM (Identity & Tenant) | Not sourced externally |
| Contact, ContactRole (ENT-006/007) | CRM | ASM-001: unique per tenant by normalized identifiers + manual confirmation |
| Candidate, Opportunity, Funnel, FunnelStage (ENT-009, 021-023) | CRM | Recruiting process is CRM-native regardless of tenant integration mode |
| Activity, Communication, Task, Event (ENT-016-020) | CRM | Engagement/operational facts |
| CustomerJourney, FollowUpScenario/Step (ENT-034-036), Case (ENT-052) | CRM | Post-sale process is CRM-native |
| Consent (ENT-048) | CRM | Legal evidence lives where it was captured |
| ContentItem, Course, Lesson, Test, UserCourse (ENT-038-043) | CRM | Content/learning authored in CRM |
| Notification, Achievement, Challenge, AutomationDefinition (ENT-046, 044-045, 051) | CRM | Platform-native |
| AIRecommendation, MetricSnapshot (ENT-047, 054) | CRM (derived) | Read-model/derived, not "mastered" by any external system — see ADR-0008 |
| AuditLog (ENT-050) | CRM | Append-only, never externally sourced |

## 2. Entities with configurable mastership (per QST-004)

| Entity (ENT) | Default (no integration) | If Network Company system connected (INT-001) | If ERP/e-commerce connected (INT-002/003) |
|---|---|---|---|
| Partner (ENT-010) | CRM (internal registration allowed per QST-005) | **Network Company system** — CRM syncs `external_id`, status; registration UC-001 becomes propose-and-confirm | n/a |
| SponsorRelation (ENT-011) | CRM | **Network Company system** — manual sponsor change blocked (BRULE-NETWORK-004), routed through reconciliation | n/a |
| MentorRelation (ENT-012) | CRM (always — mentoring is a CRM-only concept, distinct from sponsor per BRULE-NETWORK-003) | CRM | CRM |
| NetworkNode (ENT-013) | CRM-derived from SponsorRelation | Derived from synced SponsorRelation | n/a |
| Rank, RankHistory (ENT-014/015) | CRM (manual entry, QST-013: no in-CRM rank calculation in MVP) | **Reward/Network system** (INT-001/INT-007) — import only, append-only history (BR-021) | n/a |
| Product, ProductCategory (ENT-024/025) | CRM | n/a | **ERP/e-commerce** — CRM syncs catalog, no manual override of synced fields |
| ProductPrice (ENT-026) | CRM | n/a | **ERP/e-commerce** master; CRM may add tenant-specific promotional layers only if explicitly modeled as CRM-owned overlay |
| Order, OrderItem, Payment, Delivery, Return (ENT-029-033) | CRM (source of truth for CRM-created orders) | n/a | **ERP/e-commerce/payment/delivery provider** per field (financial facts immutable per master system, `docs/requirements/integrations.md` INT-003) |
| Stock/availability (attribute of Product, no dedicated ENT yet) | Not tracked (informational only) | n/a | **WMS/ERP** (INT-004) — always external once connected; CRM never treats its cache as authoritative (FR-PRODUCT-004) |
| Subscription (ENT-037) | CRM proposes; mandate/execution mastered by **Payment provider** (INT-006) | n/a | n/a |

## 3. Rule applied uniformly

1. A field's mastership mode is stored as tenant configuration (`docs/requirements/data-dictionary.md` footnote: "источник, владелец, временную актуальность и качество данных" — BR-016), not hardcoded per tenant (handoff §5).
2. In external mode, the synced copy stores `source`, `as_of`/`synced_at`, and reconciliation status alongside the value (BR-016, BR-023, BRULE-ANALYTICS-001).
3. Reconciliation jobs report received/applied/rejected counts, max source timestamp, and a checksum per `docs/requirements/integrations.md` §2; partial sync is never marked successful.
4. Emergency manual override of a mastered-elsewhere field requires a privileged, audited, reason-carrying action (SEC-018-equivalent) and is reconciled/flagged on the next sync, never silently accepted as final.

## 4. Open questions blocking full mastership sign-off

QST-004 (master per entity, general policy), QST-005 (manual partner creation allowed only in internal mode), QST-012 (volume/activity formula — blocks whether KPI-012/013/014/015/016 are CRM-calculated or imported), QST-013 (rank calculation in CRM — currently import/manual-only). Do not implement automatic mastership switching logic beyond what is stubbed here without these confirmations (handoff §8).

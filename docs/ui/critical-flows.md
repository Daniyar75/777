# Critical-flow wireframes

Status: draft, textual/sequence wireframes for the four sequential business processes in `docs/requirements/business-requirements.md` §7 (UC-001..UC-004), which are also the three MVP cross-cutting scenarios in `docs/requirements/mvp-scope.md` §1. Pixel-level wireframes are deferred to visual design; this document fixes screen sequence, state, and decision points so implementation and design agree on structure first (handoff §3.9).

## Flow 1 — UC-001 Contact → Partner (MVP scenario 1)

Screens: UI-005 Contact card → UI-006 Candidate funnel (Kanban) → transition dialog → UI-009 Partner card → onboarding route.

```mermaid
sequenceDiagram
    actor Partner
    participant ContactCard as UI-005 Contact card
    participant Funnel as UI-006 Funnel (Kanban)
    participant API
    Partner->>ContactCard: Add ContactRole = Candidate
    ContactCard->>API: POST /contacts/{id}/roles
    API-->>ContactCard: 201 Candidate role added
    Partner->>Funnel: Drag card through configured stages
    Funnel->>API: POST /opportunities/{id}/transitions (Idempotency-Key)
    alt required field missing
        API-->>Funnel: 422 VALIDATION_FAILED, field_errors
        Funnel-->>Partner: Inline required-field prompt (FR-FUNNEL-006), no transition applied
    else valid transition
        API-->>Funnel: 200 transition applied, StageHistory recorded
    end
    Partner->>Funnel: Reach "ready to register" stage
    Funnel->>API: POST /partners/register (Idempotency-Key)
    alt duplicate partner_id
        API-->>Funnel: 409 DUPLICATE_PARTNER
        Funnel-->>Partner: Show existing Partner, offer link instead of create
    else success
        API-->>Funnel: 201 Partner created, onboarding route started, PartnerRegistered published
        Funnel-->>Partner: Redirect to UI-009 Partner card, onboarding checklist visible
    end
```

States to implement on the funnel screen: loading (stage fetch), empty (no candidates in view), permission-denied (stage/action not in role's scope), validation-error (missing required field), transient-error + retry (API-012-style network failure on transition), and a distinct **conflict** state for `INVALID_STAGE_TRANSITION`/`DUPLICATE_PARTNER` that is not the generic transient-error treatment (the user needs a different next action, not "try again").

## Flow 2 — UC-002 Client → Order → Follow-up → Repeat (MVP scenario 2)

Screens: UI-005 Contact card (needs) → UI-010 Catalog/recommendation → UI-011 Order card → UI-012 Follow-up timeline → repeat-order prompt.

```mermaid
sequenceDiagram
    actor Partner
    participant Card as UI-005 Contact card
    participant Catalog as UI-010 Catalog
    participant Order as UI-011 Order card
    participant Followup as UI-012 Follow-up timeline
    participant API
    Partner->>Card: Fill needs questionnaire
    Card->>API: POST /recommendations/products
    alt no approved source
        API-->>Card: 422 (FR-REC-003), "refer to specialist" message
    else recommendation returned
        API-->>Card: 200 recommendation + citations
    end
    Partner->>Catalog: Build order from recommendation
    Catalog->>Order: POST /orders (Idempotency-Key) — snapshots price/tax/discount (BR-028)
    Order->>API: POST /orders/{id}/transitions (confirm → paid → delivered → received)
    API-->>Order: OrderReceived published exactly once
    Order->>Followup: CustomerJourney auto-created (BRULE-ORDER-004)
    Followup-->>Partner: Step timeline (D0..D+14) with due dates
    alt adverse reaction reported
        Followup->>API: POST /cases
        API-->>Followup: Marketing steps suspended, Case escalated (ACC-012)
        Followup-->>Partner: Escalation banner, no diagnostic language shown (AI-007 applies even to templated copy)
    else normal progression
        Followup-->>Partner: Expected-end approaches → repeat-order prompt (EVT-011)
        Partner->>Order: Accept prompt → draft Order created (not paid, ACC-014)
        Partner->>Order: Review and confirm draft
    end
```

States: an order transition attempted from an invalid current status must render as a **state-conflict** panel showing the current status and the valid next actions, not a generic error toast — this directly implements FR-ORDER-004's state machine being visible, not just enforced.

## Flow 3 — UC-003 Structure change (network sync/manual)

Screens: UI-020 Administration (sync job) → UI-008 Structure (reconciliation review) → node drawer.

```mermaid
sequenceDiagram
    actor Admin
    participant AdminUI as UI-020 Administration
    participant API
    participant Tree as UI-008 Structure
    Admin->>AdminUI: Upload/trigger structure sync batch
    AdminUI->>API: POST /network/sync-jobs (dry-run)
    API-->>AdminUI: AsyncJob (queued→running)
    API-->>AdminUI: report: applied/rejected counts, quarantined rows (cycle/self-sponsor)
    alt quarantined rows present
        AdminUI-->>Admin: Error-row table with reason per row (e.g., NETWORK_CYCLE), none applied for those rows
        Admin->>AdminUI: Fix source data, re-run (safe repeat, no duplicate relations)
    end
    Admin->>AdminUI: Apply reconciled batch
    AdminUI->>API: POST /network/sync-jobs (apply)
    API-->>Tree: NetworkRelationCreated events drive async tree rebuild
    Tree-->>Admin: Updated branch view, computed-at timestamp shown (FR-NETWORK-007)
```

## Flow 4 — UC-004 Complaint / adverse reaction (MVP scenario 3, leader-facing half)

Screens: UI-012 Follow-up (case creation) → UI-003 Home (leader signal) → UI-013 Task assignment.

```mermaid
sequenceDiagram
    actor Partner
    actor Leader
    participant Followup as UI-012 Follow-up
    participant API
    participant LeaderHome as UI-003 Leader home
    Partner->>Followup: Register complaint/adverse reaction
    Followup->>API: POST /cases
    API-->>Followup: Case created, severity classified, marketing steps suspended (ACC-012)
    API-->>LeaderHome: Signal surfaced if in leader's branch scope (BR-007)
    Leader->>LeaderHome: Inspect signal factors (not a bare "at risk" label — BRULE explainability)
    Leader->>LeaderHome: Create task for responsible/mentor
    LeaderHome->>API: POST /tasks
    API-->>LeaderHome: Task created, SLA tracked
    Leader->>LeaderHome: Close signal with recorded reason once resolved
```

## Cross-flow UI contract

Every screen in the four flows above renders the same six states (`docs/requirements/functional-requirements.md` §13 preamble): loading, empty, permission-denied, validation-error, transient-error+retry, and — specific to these flows — a **business-conflict** state (invalid transition, duplicate, cycle, price expired) that is visually and textually distinct from a technical transient error, because the recovery action differs (fix input / choose different action vs. retry).

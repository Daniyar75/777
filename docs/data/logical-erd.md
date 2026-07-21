# Logical ERD

Status: draft logical model derived from `docs/requirements/data-dictionary.md` (ENT-001..054) and `docs/requirements/domain-model.md`. No physical DDL/types/indexes here — those are created only after ADR-0002 (tenancy/storage) is accepted and the open QSTs affecting each bounded context are resolved (handoff §3.4). Every table implied below carries the system fields `id, tenant_id, created_at, created_by, updated_at, version` (+`archived_at` where archivable) per data-dictionary.md preamble; omitted from the diagrams for readability.

## 1. Cross-context hub: Contact

```mermaid
erDiagram
    TENANT ||--o{ CONTACT : scopes
    CONTACT ||--o{ CONTACT_ROLE : "has (multi-role, BR-001)"
    CONTACT ||--o| CLIENT : "projection"
    CONTACT ||--o| CANDIDATE : "projection"
    CONTACT ||--o| PARTNER : "projection"
    CONTACT ||--o{ CONSENT : "grants/withdraws"
    CONTACT ||--o{ ACTIVITY : "generates"
    CONTACT ||--o{ COMMUNICATION : "participates in"
    CONTACT ||--o{ TASK : "subject of"
    CONTACT ||--o{ OPPORTUNITY : "subject of"
    CONTACT ||--o{ ORDER : "as client"
```

Contact is the identity aggregate (domain-model.md §3): ContactRole, Consent, and unified history live inside its consistency boundary; role-specific projections (Client/Candidate/Partner) reference `contact_id` but own their own process state.

## 2. Recruitment

```mermaid
erDiagram
    CANDIDATE ||--o{ OPPORTUNITY : "drives"
    FUNNEL ||--o{ FUNNEL_STAGE : "versioned stages"
    FUNNEL_STAGE ||--o{ OPPORTUNITY : "current stage"
    OPPORTUNITY ||--o{ STAGE_HISTORY : "atomic transitions"
    OPPORTUNITY ||--o| PARTNER : "on registration (UC-001)"
```

`FunnelStage` is immutable once activated except via a new `Funnel` version (ENT-022); `Opportunity.current_stage` always references a stage of the funnel version it was created against, `StageHistory` is append-only.

## 3. Network

```mermaid
erDiagram
    PARTNER ||--o{ SPONSOR_RELATION : "child (one active per date, BRULE-NETWORK-001)"
    PARTNER ||--o{ MENTOR_RELATION : "mentee"
    PARTNER ||--o{ NETWORK_NODE : "position per snapshot"
    PARTNER ||--o{ RANK_HISTORY : "append-only (BR-021)"
    RANK ||--o{ RANK_HISTORY : "referenced by"
    NETWORK_NODE }o--|| NETWORK_NODE : "parent (materialized path)"
```

`SponsorRelation` and `MentorRelation` are independent, versioned by `valid_from`/interval, never overlapping for the same child on the same date (BRULE-NETWORK-001, ASM-003). `NetworkNode` is a derived/snapshot read model when structure is internally computed, or a synced projection when externally mastered (see `docs/data/mastership-matrix.md`).

## 4. Commerce

```mermaid
erDiagram
    PRODUCT ||--o{ PRODUCT_PRICE : "versioned, no ambiguous overlap"
    PRODUCT ||--o{ PRODUCT_DOCUMENT : "draft->review->approved->retired"
    PRODUCT_CATEGORY ||--o{ PRODUCT : "categorizes"
    PRODUCT_CATEGORY ||--o{ PRODUCT_CATEGORY : "hierarchy, no cycles"
    CLIENT ||--o{ PRODUCT_RECOMMENDATION : "receives"
    CLIENT ||--o{ ORDER : "places"
    ORDER ||--o{ ORDER_ITEM : "immutable after confirmation"
    ORDER_ITEM }o--|| PRODUCT : "snapshot at order time (BR-028)"
    ORDER ||--o{ PAYMENT : "one or more transactions"
    ORDER ||--o{ DELIVERY : "method/status/tracking"
    ORDER ||--o{ RETURN : "lines, reason, resolution"
    CLIENT ||--o{ SUBSCRIPTION : "recurring mandate"
```

`OrderItem` snapshots product name/price/discount/tax at confirmation time (BRULE-PRICE-001); later catalog changes never mutate a confirmed order's totals.

## 5. Customer Success

```mermaid
erDiagram
    ORDER ||--o| CUSTOMER_JOURNEY : "received triggers once (BRULE-ORDER-004)"
    FOLLOW_UP_SCENARIO ||--o{ FOLLOW_UP_STEP : "versioned steps"
    CUSTOMER_JOURNEY }o--|| FOLLOW_UP_SCENARIO : "pins active version at start (BRULE-FOLLOW-001)"
    CUSTOMER_JOURNEY ||--o{ FOLLOW_UP_STEP_INSTANCE : "step execution"
    CLIENT ||--o{ CASE : "complaint / adverse reaction"
    ORDER ||--o| CASE : "may relate to"
```

`Case` creation suspends incompatible marketing automation for the affected journey/client (BRULE-FOLLOW-002) — modeled as a cross-context event (`EVT-019 ComplaintCreated`) rather than a direct FK write into Customer Success from Commerce.

## 6. Content & Learning

```mermaid
erDiagram
    CONTENT_CATEGORY ||--o{ CONTENT_ITEM : "categorizes"
    CONTENT_ITEM ||--o{ CONTENT_ITEM : "versions (logical item + version)"
    COURSE ||--o{ LESSON : "modules/order"
    LESSON ||--o{ TEST : "assessment"
    COURSE ||--o{ USER_COURSE : "assignment"
    USER_COURSE }o--|| USER : "assignee"
```

## 7. Work Management, Engagement, Governance, Intelligence, Integration

```mermaid
erDiagram
    TASK }o--o| CONTACT : "subject (polymorphic)"
    TASK }o--o| OPPORTUNITY : "subject (polymorphic)"
    TASK }o--o| ORDER : "subject (polymorphic)"
    EVENT ||--o{ EVENT_PARTICIPANT : "registration/attendance"
    NOTIFICATION }o--|| USER : "recipient"
    AUTOMATION_DEFINITION ||--o{ AUDIT_LOG : "execution logged"
    AI_RECOMMENDATION }o--o| CONTACT : "typed subject reference"
    AI_RECOMMENDATION }o--o| OPPORTUNITY : "typed subject reference"
    INTEGRATION ||--o{ SYNC_JOB : "runs"
    METRIC_SNAPSHOT }o--|| INTEGRATION : "source, when external (BR-016)"
```

`Task.subject` and `AIRecommendation.subject` are polymorphic typed references (data-dictionary.md ENT-018, ENT-047), not a single FK column — implemented as a discriminated reference (`subject_type` + `subject_id`), validated at the application layer per subject type, not enforced by a single DB foreign key.

## 8. Deletion / lifecycle semantics (applies across all diagrams)

Per domain-model.md §4: transactional and audit records are never deleted by ordinary CRUD. `Contact` archives; on a lawful erasure request PII is anonymized while relations are retained de-identified where required (SEC-012, BRULE-DELETE-001). Reference/config entities (Funnel, FollowUpScenario, ContentItem, AutomationDefinition) deactivate/retire rather than delete, preserving history for records that reference a specific version. Hard delete is restricted to a policy job that runs after the retention period and a legal-hold check (SEC-013). See `docs/data/migration-import-rollback.md` for the operational procedure.

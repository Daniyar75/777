# Словарь данных

Все бизнес-сущности содержат `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `version`; для архивируемых — `archived_at`. Идентификаторы UUID/эквивалент. Обязательность ниже указана сверх системных полей.

| ID | Сущность / назначение | Ключевые и обязательные поля | Уникальность / статусы | Связи и жизненный цикл |
|---|---|---|---|---|
| ENT-001 | Tenant — изолированный клиент | name, slug, status, default_locale, timezone | slug global; trial/active/suspended/closed | владеет всеми данными; закрытие policy-driven |
| ENT-002 | Company — профиль сетевой компании | legal/display name, tenant_id | external_id/tenant | 1:1/1:N Tenant по модели |
| ENT-003 | User — учетная запись | login identity, status | normalized login global/realm | membership в tenant; не hard-delete при audit |
| ENT-004 | Role | code, name, scope | code/tenant | N:M Permission; versioned config |
| ENT-005 | Permission | resource, action, constraints | tuple unique | назначается Role/User exception |
| ENT-006 | Contact | display/full name, owner, source, locale | normalized channel candidates | роли, истории, согласия; archive/anonymize |
| ENT-007 | ContactRole | contact_id, role_type, valid_from | active tuple/contact/type | client/candidate/partner и прочие |
| ENT-008 | Client | contact_id, status, segment | contact_id/tenant | заказы, journey |
| ENT-009 | Candidate | contact_id, status, responsible | one active profile/contact/funnel type | opportunities |
| ENT-010 | Partner | contact_id, joined_at, status, external_id | external_id/tenant | network, rank; registered/active/inactive/former |
| ENT-011 | SponsorRelation | child_partner, sponsor_partner, valid_from | one active child/date | versioned; no cycles |
| ENT-012 | MentorRelation | mentee, mentor_user/partner, valid_from | rule-configured | versioned |
| ENT-013 | NetworkNode | partner, parent, path/depth, snapshot/version | partner/snapshot | derived/read model or internal master |
| ENT-014 | Rank | code, localized name, order | code/tenant | active/inactive |
| ENT-015 | RankHistory | partner, rank, valid_from, source | no overlapping periods | append/version correction |
| ENT-016 | Activity | actor, type, occurred_at, source | external event key | immutable fact; correction event |
| ENT-017 | Communication | channel, direction, occurred_at, participants, summary | provider_message_id/connection | contact/opportunity/order; retention |
| ENT-018 | Task | title, assignee, due_at, status, priority | recurrence occurrence key | open/in_progress/done/cancelled |
| ENT-019 | Event | type, title, start/end, timezone, owner | external_id/integration | draft/published/completed/cancelled |
| ENT-020 | EventParticipant | event, contact/user, role, status | event+participant | invited/registered/attended/no_show |
| ENT-021 | Funnel | type, name, version, status | code+version/tenant | stages; draft/active/retired |
| ENT-022 | FunnelStage | funnel_version, code, order, SLA/config | code/version | immutable after activation except new version |
| ENT-023 | Opportunity | funnel, contact, current_stage, responsible | business key optional | active/won/lost/on_hold; stage history |
| ENT-024 | Product | sku, name, category, status | sku/tenant | draft/review/active/retired |
| ENT-025 | ProductCategory | code, parent, name | code/tenant | hierarchy, no cycles |
| ENT-026 | ProductPrice | product/variant, type, currency, amount, valid period | no ambiguous priority overlap | append/versioned |
| ENT-027 | ProductDocument | product, type, version, file, status | product+type+version | approved/expired/retired |
| ENT-028 | ProductRecommendation | client, questionnaire version, result, rationale | request id | draft/accepted/rejected/expired |
| ENT-029 | Order | client, number, status, currency, totals, source | number/tenant | immutable snapshots after confirmation |
| ENT-030 | OrderItem | order, product/variant snapshot, qty, unit price, discounts | line no/order | returned qty ≤ fulfilled qty |
| ENT-031 | Payment | order, provider, amount, status, external id | provider+external id | pending/succeeded/failed/refunded |
| ENT-032 | Delivery | order, method, address snapshot, status, tracking | provider+tracking | planned/shipped/delivered/failed |
| ENT-033 | Return | order, lines, reason, resolution, status | return number/tenant | requested/approved/received/refunded/rejected |
| ENT-034 | CustomerJourney | client, order/item, scenario version, start/end, owner | start event+scenario key | active/paused/completed/cancelled |
| ENT-035 | FollowUpScenario | name, selectors, priority, version | code+version | draft/active/retired |
| ENT-036 | FollowUpStep | scenario version, offset/trigger, action, template | order/scenario | immutable activated version |
| ENT-037 | Subscription | client, schedule, mandate ref, status | provider subscription id | proposed/active/paused/cancelled |
| ENT-038 | ContentItem | type, title, locale, version, status, valid dates | logical item+version | draft/review/approved/retired |
| ENT-039 | ContentCategory | code, parent, name | code/tenant | hierarchy |
| ENT-040 | Course | title, audience, version, status | code+version | modules/lessons; publish workflow |
| ENT-041 | Lesson | course/module, order, type, content ref | order/module | prerequisites |
| ENT-042 | Test | lesson/course, questions version, pass score | version | attempts policy |
| ENT-043 | UserCourse | user/partner, course version, status, progress | assignment id | assigned/in_progress/completed/expired |
| ENT-044 | Achievement | code, rule version, title | code/version | active/retired |
| ENT-045 | Challenge | period, audience, rules, status | code+period | draft/active/completed/cancelled |
| ENT-046 | Notification | recipient, type, channel, payload/template version, status | dedupe key/channel | queued/sent/delivered/failed/read |
| ENT-047 | AIRecommendation | use_case, subject, rationale, citations, confidence, model/prompt versions | request/idempotency key | proposed/accepted/rejected/expired |
| ENT-048 | Consent | contact, purpose, channel, status, captured_at, evidence | active purpose+channel policy | granted/withdrawn/expired |
| ENT-049 | Integration | type, status, config ref, capabilities | name/tenant | secrets outside ordinary fields |
| ENT-050 | AuditLog | actor, action, resource, before/after refs, time, correlation | append-only id | immutable, protected retention |
| ENT-051 | AutomationDefinition | trigger, conditions, actions, version, status | code+version | draft/active/paused/retired |
| ENT-052 | Case | client, type, severity, owner, SLA, status | case number/tenant | complaint/adverse reaction; controlled access |
| ENT-053 | SyncJob | integration, entity type, cursor, status, counts/errors | run id | queued/running/partial/succeeded/failed |
| ENT-054 | MetricSnapshot | metric, dimensions, period, value, source/as_of | metric+dimensions+period | derived, reproducible version |

Поля здоровья, аллергий, семьи, документов, адресов и фото маркируются sensitivity class; доступ и retention задаются отдельно. Полный физический DDL создается только после решения QST и ADR по storage/multitenancy.

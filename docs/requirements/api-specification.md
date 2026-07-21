# Требования к API

## 1. Общие правила

- API должно быть версионируемым, tenant-aware и документироваться в OpenAPI до реализации.
- Авторизация проверяется на объект и поле, не только на endpoint.
- Для create/transition/payment/webhook/import используются idempotency keys.
- Ошибка имеет `code`, безопасное `message`, `field_errors`, `correlation_id`, `retryable`; PII и секреты не возвращаются.
- Конкурентные изменения защищаются optimistic locking (`version`/ETag).
- Списки используют cursor pagination, ограниченный page size, сортировки из allow-list и фильтры.
- Bulk/import — асинхронные job endpoints с отчетом; удаление — policy operation.

## 2. Группы endpoint

| ID | Группа / назначение | Основные операции и вход | Результат / права / валидации |
|---|---|---|---|
| API-001 | `/auth`, `/sessions` | login, refresh, logout, MFA, reset; credentials/token | session/token; rate limit, anti-enumeration |
| API-002 | `/tenants`, `/memberships` | provision/configure/switch tenant | tenant context; platform/admin only |
| API-003 | `/users`, `/roles`, `/permissions` | CRUD/assign/revoke | scoped identity; privilege escalation check |
| API-004 | `/contacts` | list/create/read/update/archive/restore/merge/import/export | masked Contact; duplicate/consent/scope checks |
| API-005 | `/contacts/{id}/roles|consents|timeline` | role/consent lifecycle, unified history | append/versioned records; purpose checks |
| API-006 | `/funnels`, `/stages`, `/opportunities` | configure/version, CRUD opportunity, transition | Opportunity + transition result; state validation/idempotency |
| API-007 | `/candidates`, `/clients`, `/partners` | projections/search/update permitted fields | role-specific view; uniqueness/source rules |
| API-008 | `/network/nodes|branches|relations|snapshots` | browse/search/create relation/sync status | paged tree/read model; cycle/master/scope validation |
| API-009 | `/ranks`, `/partners/{id}/rank-history` | configure/read/import rank | versioned history; master restrictions |
| API-010 | `/products`, `/categories`, `/prices`, `/documents` | catalog CRUD/workflow/query effective price | localized/effective product; version/overlap validation |
| API-011 | `/recommendations/products` | questionnaire + context | explained recommendation/citations; AI and consent rules |
| API-012 | `/orders`, `/order-items`, `/orders/{id}/transitions` | create/update/confirm/cancel/repeat | totals/status; price, stock, state, version checks |
| API-013 | `/payments/webhooks`, `/payments`, `/deliveries`, `/returns` | provider events/status/return requests | idempotent transaction result; signature checks |
| API-014 | `/journeys`, `/follow-up-scenarios`, `/cases` | configure/start/complete step/pause/escalate | versioned journey/case; complaint policy |
| API-015 | `/tasks`, `/calendar`, `/activities`, `/communications` | CRUD, complete, delegate, sync, log | scoped records; consent before send |
| API-016 | `/events`, `/participants` | CRUD/publish/register/check-in/result | event and attendance; capacity/scope checks |
| API-017 | `/content`, `/knowledge` | CRUD/workflow/search/use | approved versions for use; locale/expiry checks |
| API-018 | `/courses`, `/lessons`, `/tests`, `/assignments` | configure/assign/progress/attempt | learning record; attempt/prerequisite validation |
| API-019 | `/notifications`, `/preferences` | inbox/read/preferences/send-service | delivery status; channel eligibility |
| API-020 | `/analytics`, `/reports` | metric query, drill-down, async export | definition/as_of/data; row/field access |
| API-021 | `/ai/recommendations`, `/ai/drafts`, `/ai/feedback` | create/read/accept/reject | audit-safe recommendation; use-case policy |
| API-022 | `/integrations`, `/sync-jobs`, `/webhooks` | configure/test/sync/replay/dead-letter | admin only; secret refs; signature and idempotency |
| API-023 | `/automations`, `/executions` | draft/test/activate/pause/log/replay | versioned definition; limits/cycle checks |
| API-024 | `/audit`, `/data-requests` | search permitted audit, export/delete request | privileged, immutable evidence |

## 3. Критичные ошибки

`AUTH_REQUIRED`, `PERMISSION_DENIED`, `TENANT_MISMATCH`, `NOT_FOUND`, `VALIDATION_FAILED`, `DUPLICATE_CONTACT`, `DUPLICATE_PARTNER`, `INVALID_STAGE_TRANSITION`, `NETWORK_CYCLE`, `MASTER_DATA_READ_ONLY`, `VERSION_CONFLICT`, `ORDER_STATE_CONFLICT`, `PRICE_EXPIRED`, `CONSENT_REQUIRED`, `RATE_LIMITED`, `INTEGRATION_UNAVAILABLE`, `AI_POLICY_BLOCKED`.

## 4. Идемпотентность

Ключ связывается с tenant, actor/client, operation и canonical payload hash. Повтор с тем же payload возвращает первоначальный результат; с другим payload — `IDEMPOTENCY_CONFLICT`. Срок хранения ключа определяется риском операции и provider retry window.

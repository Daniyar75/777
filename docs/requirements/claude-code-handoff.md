# Инструкция для передачи в Claude Code

## 1. Рекомендуемая структура репозитория

```text
/docs
  /requirements       # этот комплект
  /architecture       # C4, ADR, threat model, data flows
  /api                # OpenAPI и webhook contracts
  /events             # AsyncAPI/event schemas
  /data               # logical/physical model, migrations policy
  /testing            # strategy, traceability, test cases
/apps
  /web                 # frontend shell и domain features
  /api                 # backend composition/root
/services-or-modules
  /identity-tenant
  /relationship-crm
  /recruitment
  /network
  /commerce
  /customer-success
  /work-management
  /content-learning
  /engagement
  /intelligence
  /integration
/packages
  /contracts           # DTO/event schemas; не domain entities
  /ui
  /observability
  /test-support
/infra
  /deploy
  /monitoring
  /database
/tests
  /contract
  /integration
  /e2e
  /security
```

Рекомендуется начать с модульного монолита: границы выше обязательны в коде и данных, коммуникация — через application ports/events. Выделение микросервиса допускается по измеренной нагрузке, независимому жизненному циклу или изоляции риска, а не заранее.

## 2. Разделение слоев

- Backend: use cases, domain rules/state machines, authorization, transactional outbox, adapters.
- Frontend: route/features по контекстам, permission-aware UI, forms/state/error handling; UI не является источником бизнес-валидации.
- Database: tenant isolation, constraints, temporal relations, audit/outbox, read models и migrations.
- AI: use-case registry, context builder, policy gateway, provider adapter, citations/evals/feedback. AI не обращается к БД в обход application authorization.
- Integrations: anti-corruption layer на провайдера, canonical contracts, idempotency, reconciliation и DLQ.

## 3. Документы до программирования

Claude Code должен сначала создать и запросить утверждение:

1. `docs/architecture/system-context.md` и container/component C4.
2. ADR: architecture style, tenancy/storage, auth, authorization, event delivery, file storage, search, analytics, AI provider boundary.
3. Mastership matrix по каждой сущности/полю.
4. Logical ERD и data classification/retention matrix.
5. OpenAPI skeleton и error catalog; AsyncAPI/event schema skeleton.
6. Threat model и abuse cases: tenant leakage, IDOR, mass export, spam, prompt injection, webhook replay.
7. Test strategy, quality gates и environment/deployment model.
8. MVP backlog с оценкой зависимостей и трассировкой.
9. UI information architecture и critical-flow wireframes.
10. Migration/import and rollback plans.

## 4. Порядок разработки

Следовать `roadmap.md`. Внутри этапа: уточнить QST → ADR/contract → schema/migration → domain tests → application/API → UI → integration/contract tests → security/access tests → observability → docs → acceptance demo.

## 5. Правила декомпозиции

- Одна задача изменяет один bounded context либо явно оформляет интеграционный контракт.
- Каждая задача ссылается на BR/FR/BRULE/US/ACC и создает/обновляет test ID.
- State transition, permission и idempotency реализуются сервером и тестируются отдельно.
- Сначала happy path и инварианты, затем альтернативы/ошибки, telemetry и runbook.
- Не создавать универсальный «God service», общие таблицы без владельца контекста или прямые cross-context writes.
- Настраиваемая логика хранится как версия конфигурации, а не hard-code tenant.
- Не считать story готовой без migration, rollback/forward note, audit/event и authorization tests.

## 6. Шаблон задания на модуль

```markdown
# Модуль: <название / bounded context>
Цель и scope: <BR IDs>; вне scope: <...>
Требования: <FR IDs>; правила: <BRULE IDs>; вопросы/допущения: <QST/ASM>
Агрегаты и данные: <ENT IDs>, invariants, mastership, retention
API/события: <API/EVT IDs>, idempotency, errors, compatibility
Права и privacy: роли, scope, sensitive fields, audit
UI: <UI IDs>, states, accessibility
NFR/SLO: relevant NFR
План реализации: migrations → domain → API → UI → jobs/integrations
Тесты: unit, integration, contract, e2e, security, performance
Definition of Done: <ACC/Test IDs>, docs, telemetry, rollback
Запрет: не принимать решения из QST без подтверждения; создать ADR/feature flag при необходимости.
```

## 7. Шаблон задания на User Story

```markdown
Реализовать <US-ID>: <история>.
Given context: <preconditions and actor scope>.
Основной/альтернативный/exception flow: <...>.
Rules: <BRULE>; entities: <ENT>; API/events: <API/EVT>; UI: <UI>.
Acceptance: <ACC Given/When/Then>.
Обязательно: tenant/field authorization, validation, optimistic lock,
idempotency (если mutation), audit, telemetry, safe errors, migration and tests.
Не реализовывать: <out of scope/open questions>.
Вернуть: changed files, decisions/ADR, migrations, tests and traceability update.
```

## 8. Что нельзя реализовывать без уточнения

- QST-001/002: конкретные legal consent/retention тексты и data residency;
- QST-004/012/013: mastership, formulas of volume/activity/rank/reward;
- QST-006/007/018: sponsor change, visibility depth и ownership/reassignment контактов;
- QST-008/009: конкретные channel/payment/fiscal flows;
- QST-010/011: complaint categories и хранение sensitive photos;
- QST-014: AI provider/region/PII contract;
- QST-016: договорные SLA/RPO/RTO;
- автоматический расчет вознаграждений, медицинские рекомендации, автономные рассылки и ML risk scoring.

До уточнения разрешается создавать интерфейсы/ports, feature flags и заглушки, но нельзя подставлять вымышленное бизнес-правило.

## 9. Traceability gate

Перед merge Claude Code обновляет строку:

`BR → FR → BRULE → US → ACC → API/EVT → ENT → Test → implementation files`.

CI должен проверять формат ID и существование ссылок. Ручной review проверяет смысловую, а не только синтаксическую трассировку.

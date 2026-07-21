# Каталог доменных событий

Все события содержат `event_id`, `event_type`, `schema_version`, `occurred_at`, `tenant_id`, `aggregate_type/id/version`, `correlation_id`, `causation_id`, `producer`. PII в payload минимизируется; потребитель при необходимости дочитывает разрешенные данные. Публикация — transactional outbox; потребление — inbox/deduplication и retry/DLQ.

| ID | Событие | Когда создается | Минимальный payload | Основные потребители |
|---|---|---|---|---|
| EVT-001 | ContactCreated | Contact сохранен | contact_id, source, owner | duplicate check, analytics, automation |
| EVT-002 | CandidateStageChanged | атомарный переход этапа | opportunity, from/to, reason, actor | tasks, notifications, analytics |
| EVT-003 | PartnerRegistered | Partner подтвержден master/internal flow | partner, contact, sponsor, joined_at | network, onboarding, notifications |
| EVT-004 | NetworkRelationCreated | новая версия relation активна | child, parent/type, valid_from, source | tree projection, permissions, analytics |
| EVT-005 | OrderCreated | Order создан | order, client, currency, total, source | analytics, integration |
| EVT-006 | OrderPaid | платежи покрыли требуемую сумму | order, paid_amount, payment refs | fulfillment, notifications |
| EVT-007 | OrderDelivered | доставка подтверждена | order, delivered_at, source | follow-up trigger, analytics |
| EVT-008 | OrderReceived | клиент/правило подтвердил получение | order, received_at | journey, repeat forecast |
| EVT-009 | FollowUpStarted | создан CustomerJourney | journey, order/items, scenario version | tasks, notifications |
| EVT-010 | FollowUpOverdue | шаг просрочен | journey, step, owner, due_at | alerts, leader dashboard |
| EVT-011 | ProductExpectedToEnd | наступил порог окончания | client, order item, expected_end, formula version | repeat task/message proposal |
| EVT-012 | RepeatOrderCreated | создан draft/confirmed repeat | order, source_order, confirmation state | analytics, notifications |
| EVT-013 | CourseCompleted | выполнены критерии версии | user/partner, course version, score | onboarding, achievement |
| EVT-014 | PartnerActivityDecreased | rule сформировал новый signal | partner, factors, score, window, rule version | leader alert, AI suggestion |
| EVT-015 | RankChanged | создана RankHistory | partner, old/new rank, effective_at, source | notifications, content/learning assignment |
| EVT-016 | EventAttended | attendance подтвержден | event, participant, check-in source | follow-up, conversion analytics |
| EVT-017 | AIRecommendationCreated | policy-approved recommendation stored | recommendation, use_case, subject, confidence | UI, audit, feedback |
| EVT-018 | ConsentChanged | consent granted/withdrawn/expired | contact, purpose, channel, status, effective_at | messaging suppression, audit |
| EVT-019 | ComplaintCreated | Case зарегистрирован | case, client, severity, related product/order | compliance, automation suppression |
| EVT-020 | TaskCompleted | Task закрыта | task, subject, completed_at, result | funnel/follow-up, analytics |

Порядок событий не гарантируется между агрегатами; потребитель обязан учитывать aggregate version. Эволюция схем — backward-compatible либо новый major event type.

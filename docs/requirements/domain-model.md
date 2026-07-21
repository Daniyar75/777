# Доменная модель

## 1. Bounded contexts

| Контекст | Ответственность | Основные агрегаты |
|---|---|---|
| Identity & Tenant | tenant, membership, auth, permissions, White Label | Tenant, User, Role |
| Relationship CRM | единый человек, роли, согласия, взаимодействия | Contact, Consent, Activity |
| Recruitment | кандидат и воронка рекрутинга | Candidate, Opportunity, Funnel |
| Network | структура, sponsor/mentor, ранги и объемы | Partner, NetworkNode, RankHistory |
| Commerce | продукт, цена, заказ, оплата, доставка, возврат | Product, Order, Payment, Return |
| Customer Success | использование, follow-up, жалобы, повторные продажи | CustomerJourney, FollowUpScenario, Case, Subscription |
| Work Management | задачи, календарь и события | Task, Event |
| Content & Learning | утвержденный контент, знания, курсы | ContentItem, Course |
| Engagement | уведомления и геймификация | Notification, Achievement, Challenge |
| Intelligence | KPI, read models и AI-рекомендации | MetricSnapshot, AIRecommendation |
| Integration | подключения, sync, webhooks, imports | Integration, SyncJob |
| Governance | аудит, retention, configuration versions | AuditLog, AutomationDefinition |

## 2. Ключевые связи

- Tenant 1—N Company/UserMembership/Contact и все бизнес-сущности.
- Contact 1—N ContactRole; 0..1 Client, Candidate и Partner проекции на роль/контекст.
- Partner 1—N SponsorRelation как child; на дату не более одной активной.
- Partner 1—N MentorRelation как mentee; правила одновременности настраиваются.
- Contact 1—N Communication/Task/Opportunity/Order/Consent.
- Funnel 1—N FunnelStage; Opportunity N—1 Funnel и Stage, 1—N StageHistory.
- Product N—1 ProductCategory; 1—N ProductPrice/ProductDocument/OrderItem.
- Order 1—N OrderItem/Payment/Delivery/Return; полученный Order 1—N CustomerJourney.
- FollowUpScenario 1—N FollowUpStep; CustomerJourney закрепляет version и создает step instances.
- Course 1—N Lesson/Test; User 1—N UserCourse.
- AIRecommendation ссылается на subject через типизированные reference и source citations.

## 3. Границы агрегатов

- Contact — consistency boundary для идентичности, ролей и основных каналов; история/файлы отдельны.
- Opportunity — переход этапа и StageHistory атомарны.
- Network relation — изменение связи атомарно, пересчет ветки асинхронен.
- Order — позиции и totals изменяются атомарно до подтверждения; платежи являются отдельными агрегатами с событиями.
- CustomerJourney — шаги закреплены версией сценария, но задачи могут быть отдельными агрегатами.

## 4. Правила удаления

Транзакционные записи и аудит не удаляются обычным CRUD. Contact архивируется; по законному запросу PII анонимизируется, связи сохраняются обезличенно, если требуется. Справочники и версии деактивируются. Hard delete разрешен только policy job после срока хранения и legal-hold проверки.

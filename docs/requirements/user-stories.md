# Пользовательские истории

Ниже — минимальный backlog уровня feature/story. Детальные acceptance tests находятся в `acceptance-criteria.md`; при декомпозиции одна история не должна объединять независимые права или агрегаты.

| ID | Модуль / роль / приоритет | История | Предусловия и основной сценарий | Альтернатива/исключение | Связи |
|---|---|---|---|---|---|
| US-PLATFORM-001 | Tenant / владелец / Must | Как владелец платформы, я хочу создать изолированный tenant, чтобы подключить компанию. | валидный admin; задать профиль → provision → пригласить admin | rollback при неполном provision | BR-009, SEC-003 |
| US-ADMIN-001 | Admin / администратор / Must | Как администратор, я хочу настроить роли и scope, чтобы дать минимально нужный доступ. | есть permissions; создать роль → preview → assign | запрет эскалации выше своего права | FR-ADMIN-001 |
| US-ADMIN-002 | Funnel / администратор / Must | Как администратор, я хочу опубликовать версию воронки, чтобы стандартизировать процесс. | draft config; validate → preview → activate | старая версия остается для истории | FR-FUNNEL-001 |
| US-CONTACT-001 | Contacts / партнер / Must | Как партнер, я хочу создать один контакт с несколькими ролями, чтобы не дублировать человека. | scope; ввести данные → duplicate check → save roles | открыть существующий/merge request | BR-001, FR-CONTACT-002 |
| US-CONTACT-002 | Import / партнер / Must | Как партнер, я хочу импортировать контакты с preview, чтобы перенести базу безопасно. | файл; map → dry-run → correct → confirm | partial success + error file | FR-CORE-006 |
| US-CONTACT-003 | Merge / admin / Should | Как администратор, я хочу объединить дубли, сохранив историю. | duplicate candidates; choose survivor → resolve fields → merge | financial conflict blocks merge | FR-CONTACT-005 |
| US-PARTNER-001 | Recruiting / партнер / Must | Как партнер, я хочу вести кандидата по этапам, чтобы всегда знать следующий шаг. | Candidate+Opportunity; transition → task | invalid transition blocked | BR-002, BR-005 |
| US-PARTNER-002 | Registration / партнер / Must | Как партнер, я хочу зарегистрировать готового кандидата, чтобы запустить его адаптацию. | ready stage; verify external/internal registration → create Partner | duplicate/external outage | UC-001 |
| US-NEWBIE-001 | Onboarding / новичок / Must | Как новичок, я хочу видеть адаптационный маршрут, чтобы выполнить первые действия. | PartnerRegistered; assigned route → complete steps | overdue reminder/mentor help | BR-006 |
| US-MENTOR-001 | Mentoring / наставник / Must | Как наставник, я хочу видеть прогресс назначенных новичков, чтобы вовремя помогать. | active assignment; view allowed progress → task/comment | no unrelated PII | BRULE-NETWORK-003 |
| US-LEADER-001 | Network / лидер / Must | Как лидер, я хочу просматривать ветку и сигналы активности, чтобы приоритизировать поддержку. | branch scope; filter → inspect factors → create task | masked deep-level data | BR-007 |
| US-ADMIN-003 | Network sync / admin / Must | Как администратор, я хочу импортировать структуру с проверкой циклов, чтобы синхронизировать официальный источник. | mapped file/API batch; dry-run → reconcile → apply | invalid nodes quarantined | FR-NETWORK-001 |
| US-CLIENT-001 | Needs / партнер / Must | Как партнер, я хочу зафиксировать потребность клиента, чтобы подобрать утвержденный продукт. | consent/purpose; questionnaire → recommendation | no source: specialist warning | FR-REC-001 |
| US-ORDER-001 | Order / партнер / Must | Как партнер, я хочу создать заказ из карточки клиента, чтобы сохранить контекст продажи. | active products/prices; add items → price → confirm | price conflict/out-of-stock | FR-ORDER-001 |
| US-ORDER-002 | Repeat / партнер / Must | Как партнер, я хочу повторить прошлый заказ как черновик, чтобы сократить действия. | prior eligible order; copy current valid data → review → confirm | discontinued product suggests alternative | BRULE-REPEAT-001 |
| US-CLIENT-002 | Client confirmation / клиент / Should | Как клиент, я хочу подтвердить заказ и получение, чтобы статусы были точны. | secure link/cabinet; review → confirm | expired link/re-auth | FR-ORDER-009 |
| US-FOLLOW-001 | Follow-up / партнер / Must | Как партнер, я хочу автоматически получить план сопровождения после получения, чтобы не пропустить касания. | OrderReceived; select scenario → create journey/tasks | no scenario → admin task | BRULE-ORDER-004 |
| US-FOLLOW-002 | Complaint / партнер / Must | Как партнер, я хочу зарегистрировать жалобу, чтобы передать ее ответственному и остановить неподходящие сообщения. | journey/client; create case → classify/escalate | urgent severity routes immediately | UC-004 |
| US-REPEAT-001 | Repeat forecast / партнер / Must | Как партнер, я хочу видеть клиентов с ожидаемым окончанием продукта, чтобы предложить повторный заказ вовремя. | usage inputs; compute → segment → task/draft | manual override with reason | FR-REPEAT-001 |
| US-TASK-001 | Tasks / пользователь / Must | Как пользователь, я хочу управлять задачами и напоминаниями, чтобы выполнять следующий шаг вовремя. | create/assign/due → remind → complete | delegate only in scope | FR-TASK-001 |
| US-CONTENT-001 | Content / manager / Must | Как контент-менеджер, я хочу согласовывать версии материалов, чтобы пользователи применяли только актуальный контент. | draft → review → approve/publish | expired item blocked | FR-CONTENT-001 |
| US-TRAINER-001 | Learning / тренер / Future | Как тренер, я хочу назначать курс по роли/рангу, чтобы стандартизировать развитие. | published course; target → assign → analyze | prerequisites/expiry | FR-LMS-003 |
| US-EVENT-001 | Events / организатор / Should | Как организатор, я хочу учитывать регистрацию и посещение, чтобы измерять конверсию. | publish event → invite/register → attend → follow-up | capacity/no-show | FR-EVENT-001 |
| US-AI-001 | AI / партнер / Should | Как партнер, я хочу получить резюме контакта с источниками, чтобы быстро подготовиться к касанию. | permitted timeline; generate → review | insufficient data disclosed | AI-003 |
| US-AI-002 | AI / пользователь / Should | Как пользователь, я хочу получить черновик сообщения, чтобы быстрее подготовить персональное касание. | consent eligible + approved content; generate → edit → confirm send | policy block/no consent | AI-004, AI-009 |
| US-AI-003 | AI / лидер / Should | Как лидер, я хочу объяснимый недельный отчет, чтобы определить действия по ветке. | permitted KPI; summarize → cite metrics | stale metric warning | BR-015 |
| US-NOTIF-001 | Notifications / пользователь / Must | Как пользователь, я хочу настроить каналы и частоту, чтобы получать релевантные уведомления. | preferences; configure → save | mandatory service notices cannot be fully disabled | FR-NOTIF-002 |
| US-CLIENT-003 | Privacy / клиент / Must | Как субъект данных, я хочу отозвать маркетинговое согласие, чтобы прекратить сообщения. | verified identity; withdraw → suppress → receipt | legal service messages remain | SEC-011 |
| US-AUDIT-001 | Audit / auditor-admin / Must | Как уполномоченный администратор, я хочу найти критичное изменение, чтобы расследовать инцидент. | audit permission; filter correlation/resource → view | before/after fields masked by right | SEC-007 |

## Шаблон полной истории

`US-{DOMAIN}-{NNN}` — роль, бизнес-ценность, priority, scope/release, предусловия, trigger, основной поток, альтернативы, исключения, postconditions, Given/When/Then, бизнес-правила, API, entities, events, security/privacy, analytics/telemetry, dependencies, test IDs.

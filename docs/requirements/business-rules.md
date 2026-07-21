# Реестр бизнес-правил

| ID | Название | Условие | Действие | Исключение | Настройка / источник | Связь |
|---|---|---|---|---|---|---|
| BRULE-CONTACT-001 | Мультироль | Contact существует | Допускаются несколько ContactRole | взаимоисключающие tenant-роли по настройке | tenant | BR-001, US-CONTACT-001 |
| BRULE-CONTACT-002 | Уникальность партнера | создается Partner | один partner external ID на tenant | нет | master-system | FR-RECRUIT-003 |
| BRULE-CONTACT-003 | Дубли | совпали сильные идентификаторы | показать кандидата на merge | auto-merge только для доверенного external ID | пороги tenant | FR-CONTACT-004 |
| BRULE-CONTACT-004 | Архив | объект имеет историю | скрыть из активной работы, не удалять связи | legal hold | retention policy | FR-CONTACT-006 |
| BRULE-CONSENT-001 | Проверка согласия | внешняя коммуникация | проверить purpose+channel+status+validity | обязательное service-сообщение по договору | jurisdiction profile | FR-COMM-003 |
| BRULE-CONSENT-002 | Отзыв | согласие отозвано | остановить будущие маркетинговые отправки | уже отправленные не удаляются | не отключается | BR-026 |
| BRULE-FUNNEL-001 | Допустимый переход | меняется этап | разрешить только configured transition | admin override с причиной и правом | tenant/version | FR-FUNNEL-003 |
| BRULE-FUNNEL-002 | Обязательные поля | выполняется переход | блокировать до заполнения | нет | stage config | FR-FUNNEL-006 |
| BRULE-FUNNEL-003 | Отказ | выбран lost/refused | требовать reason | нет | reason dictionary | FR-RECRUIT-002 |
| BRULE-FUNNEL-004 | Следующее действие | Opportunity остается активной | должна существовать будущая Task или причина | terminal stage | tenant SLA | BR-005 |
| BRULE-NETWORK-001 | Один sponsor | Partner активен | одна активная SponsorRelation на дату | historical relations | company rules | FR-NETWORK-004 |
| BRULE-NETWORK-002 | Нет циклов | создается sponsor relation | sponsor не равен Partner и не является потомком | нет | graph validation | FR-NETWORK-004 |
| BRULE-NETWORK-003 | Mentor отличается | назначается Mentor | Sponsor и Mentor могут различаться | нет | tenant | BR-003 |
| BRULE-NETWORK-004 | Master priority | external mode | поля структуры меняются только sync | emergency override по процедуре | integration config | FR-NETWORK-001 |
| BRULE-NETWORK-005 | Scope | User читает структуру | только разрешенное поддерево/глубина/поля | tenant admin по служебной роли | ABAC policy | SEC-004 |
| BRULE-RANK-001 | История ранга | ранг изменен | закрыть старый период и создать RankHistory | исправление с reason | master/company | BR-021 |
| BRULE-PRODUCT-001 | Утвержденные сведения | продукт используется в рекомендации | использовать approved актуальную версию | отсутствует — рекомендация блокируется | content workflow | FR-REC-003 |
| BRULE-PRODUCT-002 | Медицинские ограничения | запрос содержит диагноз/лечение | не формировать диагноз/обещание, показать предупреждение | нет | compliance policy | AI-007 |
| BRULE-PRICE-001 | Снимок цены | заказ подтвержден | зафиксировать примененное правило и суммы | корректировка отдельной операцией | price rules | BR-028 |
| BRULE-ORDER-001 | Нельзя удалить | Order paid или далее | физическое удаление запрещено | тестовые данные до оплаты | не отключается | FR-ORDER-007 |
| BRULE-ORDER-002 | State machine | меняется Order.status | только разрешенный переход | privileged correction с audit | tenant template | FR-ORDER-004 |
| BRULE-ORDER-003 | Идемпотентная оплата | получен webhook | повтор provider event не меняет итог дважды | нет | provider event ID | FR-ORDER-005 |
| BRULE-ORDER-004 | Получение | Order перешел в received | один раз запустить follow-up | нет сценария — создать task администратору | automation config | FR-ORDER-009 |
| BRULE-FOLLOW-001 | Версия сценария | создается CustomerJourney | закрепить активную версию | явная миграция с reason | scenario config | FR-FOLLOW-003 |
| BRULE-FOLLOW-002 | Жалоба | complaint/adverse reaction | приостановить marketing steps и создать Case | service/safety contact разрешен | compliance policy | FR-FOLLOW-005 |
| BRULE-REPEAT-001 | Подтверждение | прогноз наступил | создать предложение/task/draft | действующая auto-subscription mandate | tenant/legal | BR-004 |
| BRULE-REPEAT-002 | Объяснимый расчет | рассчитана expected_end | хранить входы, формулу, версию | ручная override отдельно | product rules | FR-REPEAT-001 |
| BRULE-TASK-001 | Делегирование | Task передается | новый assignee должен быть в scope | admin reassignment | permissions | FR-TASK-002 |
| BRULE-CONTENT-001 | Публикация | материал отправляется/копируется | только approved и актуальная версия | internal draft preview | workflow | FR-CONTENT-002 |
| BRULE-CONTENT-002 | Legal lock | AI адаптирует текст | protected fragments неизменяемы | перевод только approved variant | compliance metadata | AI-009 |
| BRULE-AI-001 | Human confirmation | AI предлагает внешнее действие | создать черновик и запросить подтверждение | заранее утвержденная rule automation без генеративного решения | tenant policy | AI-004 |
| BRULE-AI-002 | Scope inheritance | AI вызывается User | права AI не шире прав User и use case | системный batch — service scope | security policy | AI-002 |
| BRULE-AI-003 | Аудит | создана рекомендация | сохранить основание, данные/источники, модель, confidence и feedback | секреты/chain-of-thought не сохраняются | AI policy | AI-003 |
| BRULE-AI-004 | Неизвестность | данных недостаточно | сообщить ограничение, не выдумывать | нет | thresholds | AI-006 |
| BRULE-AUTO-001 | Exactly-once effect | событие доставлено повторно | действие с тем же key не дублируется | новая версия/новая business key | idempotency | BR-020 |
| BRULE-AUTO-002 | Защита от циклов | automation вызывает событие | проверить depth/rate и остановить цикл | ручной replay после исправления | platform limits | FR-AUTO-003 |
| BRULE-ANALYTICS-001 | Источник метрики | KPI отображается | показать определение, актуальность, источник | нет | metric catalog | BR-023 |
| BRULE-TENANT-001 | Изоляция | любая tenant-сущность | tenant_id обязателен и не меняется обычным API | контролируемая миграция | platform | SEC-003 |
| BRULE-DELETE-001 | Право на удаление | получен запрос | удалить/анонимизировать PII по policy | legal hold/обязательное хранение | jurisdiction | SEC-012 |
| BRULE-GAME-001 | Без спама | действие нарушает consent/rate policy | баллы не начисляются | нет | game rules | FR-GAME-002 |

Каждое правило должно иметь владельца, дату действия и версию в административном каталоге, если оно настраиваемое.

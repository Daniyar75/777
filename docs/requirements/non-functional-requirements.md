# Нефункциональные требования

Числа ниже — рекомендуемые стартовые SLO, а не договорные SLA. Они подтверждаются нагрузочной моделью и пилотом.

| ID | Область | MVP | Промышленная версия |
|---|---|---|---|
| NFR-PERF-001 | Интерактивное API | p95 ≤ 800 мс для обычного CRUD без внешнего вызова | p95 ≤ 400 мс, p99 ≤ 1 с |
| NFR-PERF-002 | Поиск | p95 ≤ 2 с на пилотном объеме | p95 ≤ 1 с при целевом индексе |
| NFR-PERF-003 | Дерево | первый экран ≤ 2 с, lazy page до 100 узлов | тот же SLO при ≥1 млн узлов/tenant после benchmark |
| NFR-SCALE-001 | Размер | проектировать минимум для 10 tenant, 10 тыс. users/tenant, 100 тыс. contacts/tenant | горизонтальное масштабирование до согласованного enterprise профиля |
| NFR-AVAIL-001 | Доступность | 99.5% в месяц, исключая согласованные работы | 99.9% базово; tiered SLA |
| NFR-REL-001 | Фоновые job | at-least-once delivery + idempotent effects | outbox/inbox, DLQ, replay и backlog SLO |
| NFR-DR-001 | Восстановление | рекомендуемо RPO 24 ч, RTO 8 ч | рекомендуемо RPO ≤15 мин, RTO ≤2 ч |
| NFR-OBS-001 | Наблюдаемость | structured logs, metrics, traces, correlation ID, alerts | SLO/error budgets, tenant-aware dashboards без PII |
| NFR-UX-001 | Адаптивность | desktop/tablet/mobile web, основные действия с ширины 360 px | PWA/нативное приложение по roadmap |
| NFR-A11Y-001 | Доступность | целиться в WCAG 2.1 AA для основных потоков | WCAG 2.2 AA с аудитом |
| NFR-I18N-001 | Локализация | RU и архитектура i18n; UTC storage/IANA zones | несколько локалей, pluralization, RTL-ready при необходимости |
| NFR-BROWSER-001 | Браузеры | последние 2 стабильные версии Chrome, Safari, Edge, Firefox | матрица по телеметрии клиентов |
| NFR-DATA-001 | Качество | schema validation, duplicate checks, source/as_of, import report | data quality dashboards и reconciliation SLA |
| NFR-API-001 | Совместимость | versioned REST/OpenAPI, backward-compatible minor changes | deprecation policy и consumer contract tests |
| NFR-MAINT-001 | Развертывание | миграции rollback/forward plan, feature flags | zero/low-downtime, canary/blue-green |

## Дополнительные требования

- Длительные импорты, экспорты, агрегаты, AI и интеграции выполняются асинхронно и показывают progress/status.
- Кэш не является master; ключи включают tenant и permission-sensitive context, инвалидируются событиями/TTL.
- Ошибки пользователю формулируются с действием восстановления; технические детали доступны по correlation ID поддержке.
- UI сохраняет несекретный черновик при кратковременном сбое и предотвращает двойную отправку.
- Резервное восстановление тестируется не реже согласованной периодичности; успешный backup без restore test не считается подтверждением.
- Перед enterprise запуском проводится capacity test на реальной форме дерева, распределении веток и объеме timeline, а не только на среднем числе записей.

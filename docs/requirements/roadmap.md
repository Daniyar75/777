# Roadmap

Roadmap задает зависимости, а не календарные обещания. Сроки определяются после оценки backlog, команды и интеграций.

| Этап | Результат | Зависимости / exit criteria |
|---|---|---|
| 0. Discovery & governance | утверждены QST, процессы, data ownership, legal profiles, KPI definitions | BRD baseline, ADR backlog, пилотный tenant |
| 1. Platform foundation | tenant, auth, membership, RBAC/ABAC, audit, config, observability | isolation/security tests проходят |
| 2. CRM workbench | Contact, roles, timeline, tasks, import/export, dedup | сквозной контакт и права приняты |
| 3. Recruitment & Network | funnel, registration, sponsor/mentor, tree, onboarding baseline | UC-001 и UC-003, large-tree benchmark |
| 4. Commerce | catalog, prices, sales funnel, order/payment/delivery status, returns | UC-002 до получения заказа |
| 5. Customer Success | follow-up, complaint case, expected end, repeat draft | полный UC-002, suppression tests |
| 6. Engagement | content/knowledge, notifications, events baseline, dashboard/KPI | metric reconciliation, channel consent |
| 7. AI MVP | contact summary, draft, plan day, KB Q&A, weekly report | evals, citations, policy and kill switch |
| 8. Pilot & hardening | external adapters, migration, support runbooks, DR/load/security tests | MVP ACC выполнены, pilot sign-off |
| 9. Growth | LMS, events QR, gamification, client portal, mobile | product validation |
| 10. Intelligence/Enterprise | ML signals, advanced BI, hybrid isolation, enterprise SLA | data quality, model governance, scale evidence |

Каждый этап поставляется за feature flags, включает миграцию данных, документацию, telemetry и rollback/disable plan.

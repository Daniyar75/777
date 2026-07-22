# Интеграционные требования

## 1. Общий контракт

Каждая интеграция имеет owner, mastership matrix, capability matrix, data mapping, credentials, sync cursor, retry policy, rate limits, reconciliation и runbook. Ошибки классифицируются как retryable/non-retryable; после exponential backoff с jitter запись попадает в DLQ. Все входящие webhooks проверяют подпись, timestamp и idempotency key.

| ID | Интеграция / назначение | Направление и сущности | Частота/события | Авторизация, ошибки и ограничения |
|---|---|---|---|---|
| INT-001 | Система сетевой компании | bi-dir: Partner, SponsorRelation, Rank, volumes, registration status | event/webhook + scheduled reconciliation | OAuth/mTLS; master per field; conflict report |
| INT-002 | Интернет-магазин | bi-dir: Product, Price, Order, Customer, status | near-real-time events + daily reconciliation | signed webhook; no double order via external ID |
| INT-003 | ERP | bi-dir/reference: catalog, prices, orders, financial status | scheduled/event | master matrix; immutable accounting facts |
| INT-004 | WMS/склад | inbound stock/reservation/fulfillment | event + polling fallback | stale inventory timestamp; reservation expiry |
| INT-005 | Доставка | outbound shipment, inbound tracking/status | event/webhook | provider adapter; address minimization |
| INT-006 | Платежи | outbound intent, inbound payment/refund | real-time webhook | PCI scope minimized; tokenization; signature/idempotency |
| INT-007 | Reward system | inbound calculated rank/volume/reward | daily/event | read-only display in MVP; source/as_of |
| INT-008 | Email | outbound/inbound metadata/content if permitted | queued + webhook | OAuth/API key; bounce/suppression; consent |
| INT-009 | SMS | outbound delivery | queued + receipts | API key; sender registration; country limits |
| INT-010 | WhatsApp official | templates/messages/status | user-triggered/approved automation | official API only; template/window/opt-in limits |
| INT-011 | Telegram official | bot interactions where user initiated/allowed | webhook | bot API scopes; no user scraping |
| INT-012 | Instagram/social official | permitted publishing/inbox capabilities | per provider capability | official APIs only; capability degradation |
| INT-013 | Телефония | call initiation/metadata/recording ref | event | recording consent; signed callback |
| INT-014 | Google Calendar | bi-dir Event/Task projection | incremental sync | OAuth per user; sync token/conflict policy |
| INT-015 | Microsoft Calendar | bi-dir Event/Task projection | incremental sync | OAuth per user; delta token/conflict policy |
| INT-016 | Zoom/аналог | create meeting, participant/recording metadata | on create/after meeting | OAuth; recordings by consent/retention |
| INT-017 | BI/DWH | outbound curated facts/dimensions | batch/CDC | service auth; de-identification; no access bypass |
| INT-018 | Phone contacts import | inbound Contact candidates | user initiated | device permission; preview/dedup; no silent upload |

## 2. Сверка

Для master-данных Система должна рассчитывать количество полученных/примененных/отклоненных записей, max source timestamp, checksum/контрольные итоги и список расхождений. Частичный sync не маркируется успешным. Повторный запуск с тем же source batch не создает дубли.

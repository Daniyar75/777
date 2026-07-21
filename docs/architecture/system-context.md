# System Context and Container/Component View (C4)

Status: draft, requires product-owner + architecture sign-off before implementation starts (per `docs/requirements/claude-code-handoff.md` §3.1). Traces to BR-001..BR-030 in `docs/requirements/business-requirements.md`.

## 1. Scope and starting architecture

Per ASM-013 and the handoff instruction, the platform starts as a **modular monolith**: one deployable backend (`apps/api`) composed of the bounded contexts under `services-or-modules/*`, communicating through in-process application ports and an asynchronous outbox/event bus — never direct cross-context table writes. Extraction of a module into an independently deployed service is allowed later, justified by measured load, independent release cadence, or risk isolation (see `docs/architecture/adr/0001-architecture-style.md`). This document is written so container boundaries survive that future extraction unchanged.

## 2. C4 Level 1 — System Context

```mermaid
C4Context
title Network CRM / Network OS — System Context

Person(partner, "Partner / Leader / Mentor", "Runs recruiting, sales, network and follow-up work")
Person(admin, "Company Admin", "Configures tenant: funnels, catalog, roles, automations")
Person(client, "Client", "Places orders, manages consent, gives feedback (via limited channel, no full portal in MVP)")
Person(platformOwner, "Platform Owner", "Operates the SaaS, tenants, billing tiers")

System(crm, "Network CRM / Network OS", "Multi-tenant CRM/SaaS: contacts, recruiting, network, commerce, follow-up, content, analytics, AI assistant")

System_Ext(networkCompanySys, "Network Company System", "Master for official partner registration, sponsor tree, rank, volumes (INT-001)")
System_Ext(ecommerce, "E-commerce / ERP / WMS", "Product, price, stock, order/financial master where configured (INT-002/003/004)")
System_Ext(payments, "Payment Providers", "Payment intents, webhooks, refunds (INT-006)")
System_Ext(delivery, "Delivery Providers", "Shipment and tracking (INT-005)")
System_Ext(rewardSys, "Reward / Compensation System", "Calculated rank/volume/reward, read-only in MVP (INT-007)")
System_Ext(messaging, "Official Messaging Channels", "Email, SMS, WhatsApp/Telegram official APIs, telephony (INT-008..013)")
System_Ext(calendar, "Calendar Providers", "Google/Microsoft calendar sync (INT-014/015)")
System_Ext(meeting, "Meeting Providers", "Zoom or equivalent (INT-016)")
System_Ext(bi, "BI / DWH", "Curated fact export (INT-017)")
System_Ext(aiProvider, "AI Provider", "LLM inference behind a policy gateway (QST-014)")

Rel(partner, crm, "Uses: contacts, funnels, network, orders, tasks, AI")
Rel(admin, crm, "Configures tenant, roles, funnels, automations")
Rel(client, crm, "Confirms orders/consent via limited channel")
Rel(platformOwner, crm, "Provisions tenants, monitors platform")

Rel(crm, networkCompanySys, "Sync partner/sponsor/rank (bi-directional, event+reconciliation)")
Rel(crm, ecommerce, "Sync product/price/order/stock (bi-directional)")
Rel(crm, payments, "Create payment intent / receive webhook")
Rel(crm, delivery, "Create shipment / receive tracking")
Rel(crm, rewardSys, "Read calculated reward/volume/rank")
Rel(crm, messaging, "Send templated message (consent-gated)")
Rel(crm, calendar, "Sync tasks/events (OAuth per user)")
Rel(crm, meeting, "Create meeting for event")
Rel(crm, bi, "Export curated, de-identified facts")
Rel(crm, aiProvider, "Send minimized/pseudonymized context, receive completion")
```

The platform is never the master for official partner registration, compensation calculation, or accounting facts unless a tenant explicitly configures internal mode (QST-004, QST-005, QST-013). It is always the system of engagement/activity.

## 3. C4 Level 2 — Containers

```mermaid
C4Container
title Network CRM — Containers

Person(user, "User (Partner/Leader/Admin/...)")

System_Boundary(platform, "Network CRM Platform") {
  Container(web, "Web App", "apps/web", "Route/feature modules per bounded context, permission-aware UI")
  Container(api, "API / Composition Root", "apps/api", "REST API, tenant/auth middleware, idempotency, outbox publisher; hosts all bounded-context modules in-process")
  ContainerDb(db, "Primary Database", "Relational, tenant_id on every row + RLS or equivalent (ADR-0002)", "System of record for all bounded contexts")
  ContainerDb(searchIdx, "Search Index", "Per ADR-0007", "Contact/product/content search, tenant-scoped")
  Container(cache, "Cache", "Per NFR-PERF; keys include tenant + permission context", "Read-model and session acceleration, never master")
  Container(outbox, "Outbox / Event Bus", "Transactional outbox -> broker; inbox+dedup on consumers", "Delivers EVT-001..020 at-least-once")
  Container(worker, "Async Worker Pool", "Consumes outbox, drives automations, follow-up scheduling, reconciliation, AI use cases", "Same module code as apps/api, different entrypoint")
  Container(fileStore, "File Storage", "Object storage, private + short-lived URLs (ADR-0006)", "Documents, content media, attachments")
  Container(aiGateway, "AI Policy Gateway", "packages/contracts + services-or-modules/intelligence", "Use-case registry, context builder, PII minimization, provider adapter, eval/audit")
}

System_Ext(extSystems, "External systems", "Network company, e-commerce/ERP, payments, delivery, messaging, calendar, BI, AI provider")

Rel(user, web, "HTTPS")
Rel(web, api, "HTTPS/JSON, tenant-scoped session")
Rel(api, db, "SQL, tenant_id enforced")
Rel(api, cache, "Read-through, event/TTL invalidated")
Rel(api, searchIdx, "Query/index")
Rel(api, outbox, "Publish in same transaction as write")
Rel(worker, outbox, "Consume, dedupe, retry, DLQ")
Rel(worker, db, "SQL, tenant_id enforced")
Rel(worker, extSystems, "Adapters (anti-corruption layer)")
Rel(api, fileStore, "Signed upload/download URLs")
Rel(api, aiGateway, "Use-case call with inherited scope")
Rel(aiGateway, extSystems, "Minimized context to AI provider")
```

## 4. C4 Level 3 — Component sketch (two representative modules)

### 4.1 `services-or-modules/relationship-crm`

```mermaid
C4Component
title Relationship CRM — Components

Container_Boundary(mod, "relationship-crm") {
  Component(contactApp, "Contact Application Service", "Use cases", "create/update/archive/merge Contact, manage ContactRole, enforce field/object authorization")
  Component(dedupe, "Duplicate Detector", "Domain service", "Normalized phone/email/external-id matching (BRULE-CONTACT-003)")
  Component(consentSvc, "Consent Service", "Domain service", "Purpose+channel consent lifecycle, suppression checks (BRULE-CONSENT-001/002)")
  Component(timeline, "Timeline/Activity Repository", "Read model", "Unified Contact history across contexts")
  Component(contactRepo, "Contact Repository", "Adapter", "Tenant-scoped persistence")
  Component(outboxPub, "Outbox Publisher", "Adapter", "Emits EVT-001 ContactCreated, EVT-018 ConsentChanged")
}

Rel(contactApp, dedupe, "check before create")
Rel(contactApp, consentSvc, "check/update on comms")
Rel(contactApp, contactRepo, "read/write")
Rel(contactApp, outboxPub, "publish on commit")
Rel(timeline, contactRepo, "project")
```

### 4.2 `services-or-modules/network`

```mermaid
C4Component
title Network — Components

Container_Boundary(mod, "network") {
  Component(sponsorSvc, "Sponsor/Mentor Relation Service", "Domain service", "Cycle detection, one-active-sponsor rule (BRULE-NETWORK-001/002)")
  Component(masterGuard, "Master-Mode Guard", "Domain service", "Blocks manual edits to sync-owned fields in external mode (BRULE-NETWORK-004)")
  Component(treeProjection, "Tree/Branch Read Model", "Read model", "Materialized path/depth, async rebuild (NFR-PERF-003)")
  Component(rankSvc, "Rank History Service", "Domain service", "Append-only RankHistory, no overwrite (BR-021)")
  Component(scopeSvc, "Branch Scope Resolver", "Domain service", "ABAC branch/depth/field masking (BRULE-NETWORK-005)")
  Component(networkRepo, "Network Repository", "Adapter", "Tenant-scoped persistence")
  Component(syncAdapter, "External Structure Sync Adapter", "Adapter", "Anti-corruption layer for INT-001, reconciliation")
}

Rel(sponsorSvc, networkRepo, "read/write versioned relations")
Rel(syncAdapter, sponsorSvc, "apply reconciled batch")
Rel(sponsorSvc, masterGuard, "check before manual edit")
Rel(treeProjection, networkRepo, "rebuild async on NetworkRelationCreated")
Rel(scopeSvc, treeProjection, "filter by requester branch/depth")
```

## 5. Cross-cutting concerns applied to every container

- Tenant context is resolved once at the API boundary and threaded through every call (SEC-003); no container trusts a tenant_id supplied only by the client without session/membership validation.
- Authorization is RBAC+ABAC evaluated in the application layer, not in the UI (SEC-004; see `docs/architecture/adr/0004-authorization-model.md`).
- Every mutating endpoint that creates, transitions state, pays, or replays a webhook carries an idempotency key (BR-020, BRULE-AUTO-001).
- Every container emits structured logs/metrics/traces with correlation ID and tenant ID, no PII (NFR-OBS-001, SEC-015).

## 6. Open items blocking industrial rollout

QST-004 (master per entity), QST-006/007 (sponsor change, branch visibility depth), QST-014 (AI provider/region) directly shape container boundaries above (`masterGuard`, `scopeSvc`, `aiGateway`) and must be resolved before those components leave interface/stub state, per handoff §8.

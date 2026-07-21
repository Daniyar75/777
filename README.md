# Network CRM / Network OS

Multi-tenant CRM/SaaS platform for network-marketing businesses. This repository currently holds the **architecture and planning baseline** produced from the business requirements package in `docs/requirements/`, per the handoff instructions in `docs/requirements/claude-code-handoff.md`. No product code has shipped yet — the documents below are the deliverables required *before* implementation starts (handoff §3), and they are drafts pending product-owner/architecture review, not final decisions.

## Status

Architecture baseline v0.1 (draft). Business requirements baseline v0.9 (`docs/requirements/README.md`). See `docs/requirements/open-questions.md` — no open QST may be silently resolved by inventing business logic (handoff §8).

## Repository map

```text
/docs
  /requirements       Source BRD package (product-vision, business-requirements, business-rules,
                       domain-model, data-dictionary, roles-and-permissions, api-specification,
                       event-catalog, ai-requirements, security-requirements, user-stories,
                       acceptance-criteria, mvp-scope, roadmap, assumptions, open-questions,
                       traceability-matrix, integrations, non-functional-requirements)
  /architecture        system-context.md (C4), adr/ (9 architecture decisions), threat-model.md,
                        environment-deployment.md
  /api                 openapi-skeleton.yaml, error-catalog.md
  /events               asyncapi-skeleton.yaml (EVT-001..020)
  /data                mastership-matrix.md, logical-erd.md, data-classification-retention.md,
                        migration-import-rollback.md
  /testing             test-strategy.md, quality-gates.md
  /ui                  information-architecture.md, critical-flows.md
  mvp-backlog.md        Sequenced backlog (BL-101..BL-805) tracing to BR/FR/US/ACC/API/EVT/ENT
/apps
  /web /api             Frontend shell and backend composition root — not yet implemented
/services-or-modules     One folder per bounded context (identity-tenant, relationship-crm,
                          recruitment, network, commerce, customer-success, work-management,
                          content-learning, engagement, intelligence, integration) — not yet
                          implemented; see each folder's README for scope
/packages                Shared contracts/ui/observability/test-support — not yet implemented
/infra                   deploy/monitoring/database — not yet implemented
/tests                   contract/integration/e2e/security — not yet implemented
```

## Reading order for a new contributor

1. `docs/requirements/README.md` — index and priority order of the BRD.
2. `docs/architecture/system-context.md` — C4 system context/containers/components.
3. `docs/architecture/adr/README.md` — the 9 accepted-pending architecture decisions this baseline rests on.
4. `docs/mvp-backlog.md` — what gets built, in what order, and why.
5. `docs/requirements/claude-code-handoff.md` — the process rules for turning this into code (module-per-task, traceability gate, what not to implement without confirmation).

## Ground rules carried from the handoff

- Development order: uncertainty → ADR/contract → schema/migration → domain tests → application/API → UI → integration/contract tests → security/access tests → observability → docs → acceptance demo.
- One task changes one bounded context, or explicitly defines an integration contract.
- No hard-coded tenant-specific business logic; configurable behavior is versioned tenant configuration.
- Items blocked on an open question (`docs/requirements/open-questions.md`) may get interfaces, feature flags, and stubs — never an invented business rule standing in for the missing decision.

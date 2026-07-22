# tests/security

Tenant isolation, IDOR, authorization boundary and abuse-case tests. See `docs/architecture/threat-model.md`.

Stage 1 coverage lives alongside the owning module/app instead of here, to stay close to the
code it protects: see `packages/authz/src/pdp.test.ts` (deny-by-default, deny-over-allow,
field sensitivity), `packages/eventing/src/outbox-inbox.integration.test.ts` (per-tenant RLS
isolation of outbox rows), `services-or-modules/governance/src/audit.integration.test.ts`
(audit log tenant isolation), and `apps/api/src/app.integration.test.ts` ("tenant isolation
over HTTP" — includes the cross-tenant role-permission IDOR regression test). A dedicated
cross-cutting suite belongs here once enough modules ship that abuse cases start spanning
more than one or two packages.

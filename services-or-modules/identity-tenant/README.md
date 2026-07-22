# services-or-modules/identity-tenant

Tenant, User, Role, Permission, membership, auth. Bounded context: Identity & Tenant.

Stage 1 (`docs/mvp-backlog.md` BL-101/102/103/107): tenant provisioning (`tenant-provisioning.ts`), login/MFA/refresh/session revoke (`auth.ts`, TOTP via `@network-crm/crypto`), RBAC+ABAC role/permission administration with a self-escalation guard (`roles.ts`), and the PDP context loader (`policy-context.ts`). White Label configuration is not yet implemented (later stage). Communicates with other modules only via application ports/events (no direct cross-context writes) per `docs/requirements/claude-code-handoff.md` §5 — it calls `@network-crm/governance`'s `recordAuditEntry` as a port, never its internal tables.

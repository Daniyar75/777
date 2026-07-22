# packages/access

Object-level RBAC+ABAC access checks (`requireObjectAccess`, `resolveBestScope`) shared across
`services-or-modules/*`. Builds on `@network-crm/authz`'s PDP and
`@network-crm/identity-tenant`'s `loadPolicyContext`/`ActingIdentity` — the same authorization
backbone every module uses, not a bespoke per-module check. Originally written inline in
`relationship-crm`, promoted here once `work-management` needed the identical shape (ADR-0004).

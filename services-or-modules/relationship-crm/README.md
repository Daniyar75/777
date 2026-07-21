# services-or-modules/relationship-crm

Contact, ContactRole, Consent, Activity, Communication. Bounded context: Relationship CRM.

Stage 2 (`docs/mvp-backlog.md` BL-201/202/204/205): Contact CRUD with multi-role support
(`contacts.ts`), duplicate detection on normalized phone/email/external_id (`dedupe.ts`,
`normalize.ts`), consent lifecycle (`consents.ts`), activity logging, and a unified timeline
merging activities/consents/role changes (`timeline.ts`, `activities.ts`). Object-level
RBAC+ABAC checks go through `access.ts`, which loads the PDP context via
`@network-crm/identity-tenant` — the same authorization backbone every module uses, not a
bespoke check. Not yet implemented: BL-203 (import/export) and BL-206 (merge/dedupe
resolution — duplicates are surfaced today but never automatically merged); Communication
(FR-COMM) is deferred to a later stage. Communicates with other modules only via application
ports/events (no direct cross-context writes) per `docs/requirements/claude-code-handoff.md` §5.

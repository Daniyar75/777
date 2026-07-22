# services-or-modules/relationship-crm

Contact, ContactRole, Consent, Activity, Communication. Bounded context: Relationship CRM.

Stage 2 (`docs/mvp-backlog.md` BL-201/202/203/204/205/206): Contact CRUD with multi-role support
(`contacts.ts`), duplicate detection on normalized phone/email/external_id (`dedupe.ts`,
`normalize.ts`), consent lifecycle (`consents.ts`), activity logging, and a unified timeline
merging activities/consents/role changes (`timeline.ts`, `activities.ts`). CSV import
(dry-run/commit, safe to re-run — matching rows default to skipped rather than duplicated) and
CSV export (`import-export.ts`) — column mapping happens client-side, this module only accepts
already-mapped rows. Merge resolution (`merge.ts`): survivor/duplicate model, the losing
contact is archived and aliased via `merged_into_id` rather than deleted, role collisions close
the loser's role instead of duplicating it, consents/activities transfer unconditionally, and
the caller may override specific survivor fields. Object-level RBAC+ABAC checks go through
`access.ts`/`@network-crm/access`, which load the PDP context via `@network-crm/identity-tenant`
— the same authorization backbone every module uses, not a bespoke check. Communication
(FR-COMM) is deferred to a later stage. Communicates with other modules only via application
ports/events (no direct cross-context writes) per `docs/requirements/claude-code-handoff.md` §5.

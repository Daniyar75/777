# services-or-modules/work-management

Task, Event, EventParticipant. Bounded context: Work Management.

Stage 2 (`docs/mvp-backlog.md` BL-207): Task create/read/list/complete/delegate (`tasks.ts`).
Object-level ABAC goes through the shared `@network-crm/access` package (owner OR assignee
scope — a Task has two "mine" relationships, unlike Contact's single owner). Delegation
(FR-TASK-002/BRULE-TASK-001) checks the new assignee is an active member of the tenant and
records the previous assignee via the audit log's before/after fields rather than a separate
delegation-history table. Not yet implemented: Event/EventParticipant, recurrence, checklists,
file attachments, and comments (all part of FR-TASK-001's full scope). Communicates with other
modules only via application ports/events (no direct cross-context writes) per
`docs/requirements/claude-code-handoff.md` §5.

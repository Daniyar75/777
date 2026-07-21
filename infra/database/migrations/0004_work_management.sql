-- Stage 2 (BL-207, Work Management). Mirrors infra/database/src/schema.ts. Same RLS pattern
-- as prior migrations: tenant_id + nullif(current_setting('app.tenant_id', true), '')::uuid.

create type task_priority as enum ('low', 'normal', 'high', 'urgent');
create type task_status as enum ('open', 'in_progress', 'done', 'cancelled');

-- ---- ENT-018 Task ----
create table tasks (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  type text not null default 'general',
  -- Polymorphic reference (e.g. contact), validated at the application layer per subject
  -- type — not a DB foreign key, matching data-dictionary.md ENT-018/ENT-047's pattern.
  subject_type text,
  subject_id uuid,
  title text not null,
  owner_user_id uuid not null references users (id),
  assignee_user_id uuid not null references users (id),
  due_at timestamptz,
  priority task_priority not null default 'normal',
  status task_status not null default 'open',
  completed_at timestamptz,
  completed_by uuid,
  completion_evidence text,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  version integer not null default 0
);
create index tasks_tenant_owner_idx on tasks (tenant_id, owner_user_id);
create index tasks_tenant_assignee_idx on tasks (tenant_id, assignee_user_id);
create index tasks_tenant_subject_idx on tasks (tenant_id, subject_type, subject_id);

alter table tasks enable row level security;
alter table tasks force row level security;
create policy tenant_isolation on tasks
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

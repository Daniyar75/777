-- Stage 2 (CRM Workbench, docs/mvp-backlog.md BL-201..207): Relationship CRM.
-- Mirrors infra/database/src/schema.ts. Same RLS pattern as 0001_init.sql: tenant_id +
-- nullif(current_setting('app.tenant_id', true), '')::uuid, forgetting to set the context
-- denies all rows rather than leaking or erroring (see 0001_init.sql's header comment).

create type contact_status as enum ('active', 'archived');
create type contact_role_type as enum ('candidate', 'client', 'partner', 'other');
create type contact_role_status as enum ('active', 'inactive');
create type consent_status as enum ('granted', 'withdrawn', 'expired');

-- ---- ENT-006 Contact — identity aggregate (BR-001) ----
create table contacts (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  owner_user_id uuid not null references users (id),
  display_name text not null,
  full_name text,
  source text,
  -- Normalized for duplicate detection (BRULE-CONTACT-003); not unique — a match surfaces as
  -- a candidate for merge, it never silently blocks or auto-merges (FR-CONTACT-004/005).
  normalized_phone text,
  normalized_email text,
  external_id text,
  status contact_status not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  version integer not null default 0,
  archived_at timestamptz
);
create index contacts_tenant_idx on contacts (tenant_id);
create index contacts_tenant_owner_idx on contacts (tenant_id, owner_user_id);
create index contacts_tenant_phone_idx on contacts (tenant_id, normalized_phone);
create index contacts_tenant_email_idx on contacts (tenant_id, normalized_email);

alter table contacts enable row level security;
alter table contacts force row level security;
create policy tenant_isolation on contacts
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- ENT-007 ContactRole — multiple simultaneous roles per Contact (BRULE-CONTACT-001) ----
create table contact_roles (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  contact_id uuid not null references contacts (id),
  role_type contact_role_type not null,
  status contact_role_status not null default 'active',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0
);
create index contact_roles_tenant_contact_idx on contact_roles (tenant_id, contact_id);

-- One active role of a given type per contact at a time (a closed/inactive prior role
-- doesn't block re-adding the same role type later).
create unique index contact_roles_one_active_per_type
  on contact_roles (contact_id, role_type)
  where status = 'active';

alter table contact_roles enable row level security;
alter table contact_roles force row level security;
create policy tenant_isolation on contact_roles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- ENT-048 Consent — purpose+channel scoped, evidence retained (SEC-011) ----
create table consents (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  contact_id uuid not null references contacts (id),
  purpose text not null,
  channel text not null,
  status consent_status not null,
  captured_at timestamptz not null default now(),
  effective_at timestamptz not null default now(),
  evidence jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null
);
create index consents_tenant_contact_purpose_channel_idx on consents (tenant_id, contact_id, purpose, channel);

alter table consents enable row level security;
alter table consents force row level security;
create policy tenant_isolation on consents
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- ENT-016 Activity — immutable fact feeding the unified timeline (FR-CONTACT-003) ----
create table activities (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  contact_id uuid not null references contacts (id),
  actor_user_id uuid,
  type text not null,
  summary text,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual',
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);
create index activities_tenant_contact_idx on activities (tenant_id, contact_id);

alter table activities enable row level security;
alter table activities force row level security;
create policy tenant_isolation on activities
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- Append-only in application code (no update/delete exposed by services-or-modules/relationship-crm),
-- same discipline as audit_log though not yet DB-enforced via a revoked GRANT (0001_init.sql's note
-- on audit_log applies here too — deferred until the deployed app's DB role name is fixed).

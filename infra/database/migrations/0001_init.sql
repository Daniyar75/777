-- Stage 1 (Platform Foundation) schema. Mirrors infra/database/src/schema.ts.
-- Tenant isolation model: docs/architecture/adr/0002-tenancy-and-storage.md.
-- RLS keys off the transaction-local GUC app.tenant_id, set by
-- infra/database/src/db.ts#withTenantContext. current_setting(..., true) returns NULL the
-- first time a session touches this GUC, but Postgres resets a custom GUC that was ever set
-- with SET LOCAL/set_config(..., true) to '' (empty string), not back to NULL, once that
-- transaction ends — so a later transaction on the same pooled connection that forgets to
-- set the context would otherwise hit `'' :: uuid`, a cast error, instead of cleanly
-- matching no rows. Wrapping in nullif(..., '') normalizes both "never set" and "reset after
-- a prior local set" to SQL NULL, so `tenant_id = NULL` is reliably false in both cases —
-- forgetting to set the context always denies all rows, it never leaks and never errors.

create type tenant_status as enum ('trial', 'active', 'suspended', 'closed');
create type user_status as enum ('active', 'suspended', 'deactivated');
create type membership_status as enum ('active', 'suspended');
create type role_scope as enum ('self', 'owned', 'assigned', 'mentored', 'branch', 'tenant', 'platform');
create type permission_effect as enum ('allow', 'deny');
create type field_sensitivity as enum ('none', 'pii_standard', 'pii_sensitive');
create type session_kind as enum ('identity', 'tenant');

-- ---- ENT-001 Tenant ----
create table tenants (
  id uuid primary key,
  name text not null,
  slug text not null,
  status tenant_status not null default 'trial',
  default_locale text not null default 'ru',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0
);
create unique index tenants_slug_unique on tenants (slug);

-- ---- ENT-003 User (tenant-independent identity, QST-017) ----
create table users (
  id uuid primary key,
  login_identity text not null,
  password_hash text not null,
  display_name text not null,
  status user_status not null default 'active',
  mfa_enabled boolean not null default false,
  mfa_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0
);
create unique index users_login_identity_unique on users (login_identity);

-- ---- Membership: User x Tenant ----
create table memberships (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  user_id uuid not null references users (id),
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0
);
create unique index memberships_tenant_user_unique on memberships (tenant_id, user_id);
create index memberships_tenant_idx on memberships (tenant_id);

alter table memberships enable row level security;
alter table memberships force row level security;
create policy tenant_isolation on memberships
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- ENT-004 Role (tenant-scoped) ----
create table roles (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  code text not null,
  name text not null,
  scope role_scope not null,
  branch_depth integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0
);
create unique index roles_tenant_code_unique on roles (tenant_id, code);

alter table roles enable row level security;
alter table roles force row level security;
create policy tenant_isolation on roles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- ENT-005 Permission (global resource/action catalog, not tenant data) ----
create table permissions (
  id uuid primary key,
  resource text not null,
  action text not null
);
create unique index permissions_resource_action_unique on permissions (resource, action);

-- ---- Role -> Permission bindings (tenant-scoped) ----
create table role_permissions (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  role_id uuid not null references roles (id),
  permission_id uuid not null references permissions (id),
  effect permission_effect not null default 'allow',
  scope role_scope not null,
  branch_depth integer,
  allowed_field_sensitivity jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index role_permissions_tenant_idx on role_permissions (tenant_id);
create index role_permissions_role_idx on role_permissions (role_id);
create unique index role_permissions_unique on role_permissions (role_id, permission_id);

alter table role_permissions enable row level security;
alter table role_permissions force row level security;
create policy tenant_isolation on role_permissions
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- Membership -> Role assignment ----
create table membership_roles (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  membership_id uuid not null references memberships (id),
  role_id uuid not null references roles (id),
  created_at timestamptz not null default now()
);
create unique index membership_roles_unique on membership_roles (membership_id, role_id);
create index membership_roles_tenant_idx on membership_roles (tenant_id);

alter table membership_roles enable row level security;
alter table membership_roles force row level security;
create policy tenant_isolation on membership_roles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---- Auth: MFA challenge, session, refresh token (ADR-0003) ----
-- Identity tables: not tenant-scoped by design (QST-017), app-layer authorization only.
-- TOTP verification is stateless (derived from users.mfa_secret + current time, RFC 6238);
-- this table only tracks which pending login is awaiting a code and prevents replay of a
-- consumed challenge — it does not store the code itself.
create table mfa_challenges (
  id uuid primary key,
  user_id uuid not null references users (id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users (id),
  tenant_id uuid references tenants (id),
  membership_id uuid references memberships (id),
  kind session_kind not null default 'identity',
  mfa_verified boolean not null default false,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index sessions_user_idx on sessions (user_id);

create table refresh_tokens (
  id uuid primary key,
  session_id uuid not null references sessions (id),
  token_hash text not null,
  family_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_id uuid
);
create unique index refresh_tokens_token_hash_unique on refresh_tokens (token_hash);
create index refresh_tokens_family_idx on refresh_tokens (family_id);

-- ---- ENT-050 AuditLog (append-only, SEC-007/SEC-008) ----
create table audit_log (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  actor_user_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  before jsonb,
  after jsonb,
  reason text,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);
create index audit_log_tenant_idx on audit_log (tenant_id);
create index audit_log_correlation_idx on audit_log (correlation_id);

alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy tenant_isolation on audit_log
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- audit_log is append-only (SEC-008 "AuditLog должен быть append-only, защищен от изменения
-- обычными администраторами"). RLS above only re-scopes rows by tenant, it does not by itself
-- forbid UPDATE/DELETE, so immutability is enforced at the application layer today
-- (services-or-modules/governance exposes no update/delete operation for this table). Before
-- production rollout, additionally run, once the deployed app's DB role name is known:
--   revoke update, delete on audit_log from <app_role>;
-- which is deliberately not baked into this portable migration.

-- ---- Transactional outbox / inbox (ADR-0005) ----
create table outbox_events (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  event_id uuid not null,
  event_type text not null,
  schema_version text not null,
  occurred_at timestamptz not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version integer not null,
  correlation_id uuid not null,
  causation_id uuid,
  producer text not null,
  payload jsonb not null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index outbox_events_event_id_unique on outbox_events (event_id);
create index outbox_events_tenant_idx on outbox_events (tenant_id);
create index outbox_events_dispatched_idx on outbox_events (dispatched_at);

alter table outbox_events enable row level security;
alter table outbox_events force row level security;
create policy tenant_isolation on outbox_events
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create table inbox_consumed (
  id uuid primary key,
  tenant_id uuid not null references tenants (id),
  event_id uuid not null,
  consumer_name text not null,
  processed_at timestamptz not null default now()
);
create unique index inbox_consumed_event_consumer_unique on inbox_consumed (event_id, consumer_name);

alter table inbox_consumed enable row level security;
alter table inbox_consumed force row level security;
create policy tenant_isolation on inbox_consumed
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- memberships' base tenant_isolation policy (0001_init.sql) makes it impossible for a user
-- to enumerate which tenants they belong to without already knowing a tenant_id to scope by —
-- but that enumeration is exactly what login (QST-017: one User, many tenant memberships)
-- needs before a tenant has been selected. Rather than bypass RLS, add a second permissive
-- SELECT-only policy scoped to the acting user's own rows; Postgres combines multiple
-- permissive policies for the same command with OR, so this only ever *adds* visibility of
-- the caller's own membership rows across tenants — it never widens tenant_isolation's
-- INSERT/UPDATE/DELETE guarantees, and it never lets a user see another user's membership row.
create policy self_membership_lookup on memberships
  for select
  using (user_id = nullif(current_setting('app.acting_user_id', true), '')::uuid);

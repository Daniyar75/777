import { sql } from "drizzle-orm";
import { createDb, createPool, type Database } from "@network-crm/database";

/**
 * Test tenants are synthetic and only ever exist inside the dedicated test database — they
 * are never provisioned in a production tenant table, so they are excluded from production
 * analytics by construction rather than by an is_test flag scattered through query logic
 * (docs/testing/test-strategy.md §4).
 */
export function getTestDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgres://crm_app:crm_app_dev_pw@localhost:5432/network_crm_test"
  );
}

export function createTestDb(): { db: Database; close: () => Promise<void> } {
  const pool = createPool(getTestDatabaseUrl());
  const db = createDb(pool);
  return { db, close: () => pool.end() };
}

const TABLES_IN_TRUNCATE_ORDER = [
  "inbox_consumed",
  "outbox_events",
  "audit_log",
  "refresh_tokens",
  "sessions",
  "mfa_challenges",
  "membership_roles",
  "role_permissions",
  "permissions",
  "roles",
  "memberships",
  "users",
  "tenants",
];

/** TRUNCATE is not subject to RLS (it is not a DML statement), so this works regardless of app.tenant_id. */
export async function truncateAll(db: Database): Promise<void> {
  const tableList = TABLES_IN_TRUNCATE_ORDER.join(", ");
  await db.execute(sql.raw(`truncate table ${tableList} restart identity cascade`));
}

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema.js";
export * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

/**
 * Sets the transaction-local Postgres session variable app.tenant_id via
 * set_config(..., true). Every RLS policy in migrations/0001_init.sql keys off this
 * variable (ADR-0002). Must be called from inside an open transaction; SET LOCAL only
 * takes effect for that transaction, so it can never leak to a pooled connection reused
 * by a later, differently-scoped request. Exported separately from withTenantContext so
 * a flow that legitimately mixes a global write (e.g. inserting the Tenant row itself)
 * with tenant-scoped writes in one atomic transaction — tenant provisioning being the
 * canonical case, US-PLATFORM-001's "rollback on incomplete provision" — can call it
 * mid-transaction instead of needing two separate commits.
 */
export async function setTenantContext(tx: Database, tenantId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
}

/** Runs fn inside a transaction with app.tenant_id already set (see setTenantContext). */
export async function withTenantContext<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenantContext(tx as unknown as Database, tenantId);
    return fn(tx as unknown as Database);
  });
}

/**
 * Sets app.acting_user_id, the GUC behind memberships' self_membership_lookup RLS policy
 * (migrations/0002_membership_self_lookup.sql). Lets a user enumerate their own membership
 * rows across tenants before a tenant has been selected (QST-017), without weakening
 * tenant_isolation for any other operation on the table — see that migration's comment.
 */
export async function setActingUserContext(tx: Database, userId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.acting_user_id', ${userId}, true)`);
}

/** Runs fn inside a transaction with app.acting_user_id already set (see setActingUserContext). */
export async function withActingUserContext<T>(
  db: Database,
  userId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setActingUserContext(tx as unknown as Database, userId);
    return fn(tx as unknown as Database);
  });
}

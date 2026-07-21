import { eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { claimUndispatched, markDispatched, type OutboxRow } from "./outbox.js";

/**
 * The relay is the only cross-tenant component in the eventing package. Rather than
 * granting a bypass-RLS database role (a second trust tier to reason about), it lists
 * tenants from the tenants table (not RLS-protected — it is not tenant business data)
 * and then processes each tenant strictly inside its own withTenantContext transaction,
 * so every row it ever touches still passes through the same RLS policy as a normal
 * request (ADR-0002, ADR-0005). At MVP scale (NFR-SCALE-001: ~10 tenants) this is cheap;
 * revisit if/when tenant count makes per-tenant polling a bottleneck.
 */
export interface RelayResult {
  tenantsProcessed: number;
  eventsDispatched: number;
  failures: Array<{ eventId: string; error: unknown }>;
}

export async function runRelayOnce(
  db: Database,
  publishToBroker: (row: OutboxRow) => Promise<void>,
  batchSizePerTenant = 50,
): Promise<RelayResult> {
  const tenants = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.status, "active"));

  let eventsDispatched = 0;
  const failures: RelayResult["failures"] = [];

  for (const tenant of tenants) {
    const claimed = await withTenantContext(db, tenant.id, (tx) =>
      claimUndispatched(tx, batchSizePerTenant),
    );
    for (const row of claimed) {
      try {
        await publishToBroker(row);
        await withTenantContext(db, tenant.id, (tx) => markDispatched(tx, row.eventId));
        eventsDispatched += 1;
      } catch (error) {
        // Left undispatched: at-least-once delivery relies on the next poll to retry.
        // A production deployment adds a retry-count column and DLQ threshold here
        // (docs/architecture/adr/0005-event-delivery.md); MVP relies on poll-interval backoff.
        failures.push({ eventId: row.eventId, error });
      }
    }
  }

  return { tenantsProcessed: tenants.length, eventsDispatched, failures };
}

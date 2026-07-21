import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@network-crm/database";

export async function alreadyProcessed(
  tx: Database,
  eventId: string,
  consumerName: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: schema.inboxConsumed.id })
    .from(schema.inboxConsumed)
    .where(
      and(
        eq(schema.inboxConsumed.eventId, eventId),
        eq(schema.inboxConsumed.consumerName, consumerName),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function markProcessed(
  tx: Database,
  tenantId: string,
  eventId: string,
  consumerName: string,
): Promise<void> {
  await tx
    .insert(schema.inboxConsumed)
    .values({ id: randomUUID(), tenantId, eventId, consumerName })
    .onConflictDoNothing({
      target: [schema.inboxConsumed.eventId, schema.inboxConsumed.consumerName],
    });
}

/**
 * Runs `handler` at most once per (eventId, consumerName), inside the given transaction
 * (which must already be tenant-scoped for eventTenantId via withTenantContext, ADR-0005).
 * If handler throws, the transaction rolls back and the event remains unprocessed for a
 * later retry — this is what makes at-least-once delivery safe to consume idempotently.
 */
export async function withIdempotentConsumer(
  tx: Database,
  event: { tenantId: string; eventId: string },
  consumerName: string,
  handler: (tx: Database) => Promise<void>,
): Promise<"processed" | "skipped-duplicate"> {
  if (await alreadyProcessed(tx, event.eventId, consumerName)) {
    return "skipped-duplicate";
  }
  await handler(tx);
  await markProcessed(tx, event.tenantId, event.eventId, consumerName);
  return "processed";
}

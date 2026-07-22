import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { EventEnvelope } from "@network-crm/contracts";
import { schema, type Database } from "@network-crm/database";

/**
 * Append an event to the transactional outbox. MUST be called with the same
 * transaction object (tx) used for the domain write it accompanies, so both
 * commit or roll back together (ADR-0005). The RLS policy on outbox_events
 * requires the caller to already be inside a withTenantContext transaction.
 */
export async function publish(tx: Database, envelope: EventEnvelope): Promise<void> {
  await tx.insert(schema.outboxEvents).values({
    id: randomUUID(),
    tenantId: envelope.tenant_id,
    eventId: envelope.event_id,
    eventType: envelope.event_type,
    schemaVersion: envelope.schema_version,
    occurredAt: new Date(envelope.occurred_at),
    aggregateType: envelope.aggregate_type,
    aggregateId: envelope.aggregate_id,
    aggregateVersion: envelope.aggregate_version,
    correlationId: envelope.correlation_id,
    causationId: envelope.causation_id,
    producer: envelope.producer,
    payload: envelope.payload,
  });
}

/** Convenience constructor: fills in event_id/occurred_at, still needs an explicit publish() call. */
export function makeEnvelope(input: {
  eventType: string;
  schemaVersion?: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string | null;
  producer: string;
  payload: Record<string, unknown>;
}): EventEnvelope {
  return {
    event_id: randomUUID(),
    event_type: input.eventType,
    schema_version: input.schemaVersion ?? "1.0",
    occurred_at: new Date().toISOString(),
    tenant_id: input.tenantId,
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    aggregate_version: input.aggregateVersion,
    correlation_id: input.correlationId,
    causation_id: input.causationId ?? null,
    producer: input.producer,
    payload: input.payload,
  };
}

export interface OutboxRow {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  occurredAt: Date;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId: string | null;
  producer: string;
  payload: unknown;
}

/** Claim up to `limit` undispatched rows within the current tenant context, oldest first. */
export async function claimUndispatched(tx: Database, limit = 50): Promise<OutboxRow[]> {
  const rows = await tx
    .select()
    .from(schema.outboxEvents)
    .where(isNull(schema.outboxEvents.dispatchedAt))
    .orderBy(asc(schema.outboxEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    eventId: r.eventId,
    eventType: r.eventType,
    schemaVersion: r.schemaVersion,
    occurredAt: r.occurredAt,
    tenantId: r.tenantId,
    aggregateType: r.aggregateType,
    aggregateId: r.aggregateId,
    aggregateVersion: r.aggregateVersion,
    correlationId: r.correlationId,
    causationId: r.causationId,
    producer: r.producer,
    payload: r.payload,
  }));
}

export async function markDispatched(tx: Database, eventId: string): Promise<void> {
  await tx
    .update(schema.outboxEvents)
    .set({ dispatchedAt: new Date() })
    .where(
      and(eq(schema.outboxEvents.eventId, eventId), isNull(schema.outboxEvents.dispatchedAt)),
    );
}

import { randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { schema, type Database } from "@network-crm/database";
import type { AuditLogEntry, RecordAuditEntryInput } from "@network-crm/contracts";

/**
 * Records one AuditLog entry (ENT-050, SEC-007/SEC-008). MUST be called with the same
 * transaction (tx) as the domain change it documents, so both commit or roll back
 * together — an audited action that "half happened" is worse than one that didn't
 * happen at all. There is deliberately no update/delete export from this module:
 * AuditLog is append-only by construction, not by convention (see
 * infra/database/migrations/0001_init.sql for the matching DB-level note).
 */
export async function recordAuditEntry(
  tx: Database,
  input: RecordAuditEntryInput,
): Promise<AuditLogEntry> {
  const [row] = await tx
    .insert(schema.auditLog)
    .values({
      id: randomUUID(),
      tenantId: input.tenant_id,
      actorUserId: input.actor_user_id,
      action: input.action,
      resourceType: input.resource_type,
      resourceId: input.resource_id,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      correlationId: input.correlation_id,
    })
    .returning();
  const r = row!;
  return {
    id: r.id,
    tenant_id: r.tenantId,
    actor_user_id: r.actorUserId,
    action: r.action,
    resource_type: r.resourceType,
    resource_id: r.resourceId,
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
    reason: r.reason,
    correlation_id: r.correlationId,
    occurred_at: r.occurredAt.toISOString(),
  };
}

export interface AuditQuery {
  correlationId?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  cursor?: string; // occurred_at ISO string of the last item on the previous page
  pageSize?: number;
}

/**
 * Search within the caller's tenant scope (RLS already restricts rows to the tenant
 * set on tx via withTenantContext — this query never needs its own tenant filter).
 * Field-level masking of before/after by requester right (ACC-020) is applied by the
 * caller (apps/api route), which knows the requester's PDP-resolved field access —
 * this module only returns the raw audited record.
 */
export async function searchAuditLog(
  tx: Database,
  query: AuditQuery,
): Promise<{ items: AuditLogEntry[]; nextCursor: string | null }> {
  const pageSize = Math.min(query.pageSize ?? 50, 200);
  const conditions = [
    query.correlationId ? eq(schema.auditLog.correlationId, query.correlationId) : undefined,
    query.resourceType ? eq(schema.auditLog.resourceType, query.resourceType) : undefined,
    query.resourceId ? eq(schema.auditLog.resourceId, query.resourceId) : undefined,
    query.actorUserId ? eq(schema.auditLog.actorUserId, query.actorUserId) : undefined,
    query.cursor ? lt(schema.auditLog.occurredAt, new Date(query.cursor)) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = await tx
    .select()
    .from(schema.auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(pageSize + 1);

  const page = rows.slice(0, pageSize);
  const nextCursor = rows.length > pageSize ? page[page.length - 1]!.occurredAt.toISOString() : null;

  return {
    items: page.map((r) => ({
      id: r.id,
      tenant_id: r.tenantId,
      actor_user_id: r.actorUserId,
      action: r.action,
      resource_type: r.resourceType,
      resource_id: r.resourceId,
      before: (r.before as Record<string, unknown> | null) ?? null,
      after: (r.after as Record<string, unknown> | null) ?? null,
      reason: r.reason,
      correlation_id: r.correlationId,
      occurred_at: r.occurredAt.toISOString(),
    })),
    nextCursor,
  };
}

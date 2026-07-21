import type { schema } from "@network-crm/database";
import type { Activity, Consent, Contact, ContactRole } from "@network-crm/contracts";

export function mapContact(row: typeof schema.contacts.$inferSelect): Contact {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    owner_user_id: row.ownerUserId,
    display_name: row.displayName,
    full_name: row.fullName,
    source: row.source,
    normalized_phone: row.normalizedPhone,
    normalized_email: row.normalizedEmail,
    external_id: row.externalId,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy,
    updated_at: row.updatedAt.toISOString(),
    version: row.version,
    archived_at: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export function mapContactRole(row: typeof schema.contactRoles.$inferSelect): ContactRole {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    contact_id: row.contactId,
    role_type: row.roleType,
    status: row.status,
    valid_from: row.validFrom.toISOString(),
    valid_to: row.validTo ? row.validTo.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    version: row.version,
  };
}

export function mapConsent(row: typeof schema.consents.$inferSelect): Consent {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    contact_id: row.contactId,
    purpose: row.purpose,
    channel: row.channel,
    status: row.status,
    captured_at: row.capturedAt.toISOString(),
    effective_at: row.effectiveAt.toISOString(),
    evidence: (row.evidence as Record<string, unknown> | null) ?? null,
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy,
  };
}

export function mapActivity(row: typeof schema.activities.$inferSelect): Activity {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    contact_id: row.contactId,
    actor_user_id: row.actorUserId,
    type: row.type,
    summary: row.summary,
    occurred_at: row.occurredAt.toISOString(),
    source: row.source,
    correlation_id: row.correlationId,
    created_at: row.createdAt.toISOString(),
  };
}

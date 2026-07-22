import { and, eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type TimelineEntry } from "@network-crm/contracts";
import { requireObjectAccess } from "@network-crm/access";

/**
 * FR-CONTACT-003: unified cross-context history. Stage 2 sources are Activity, Consent, and
 * ContactRole changes; later stages add Communication, Opportunity, and Order events into the
 * same merge point rather than a parallel timeline.
 */
export async function getTimeline(db: Database, identity: ActingIdentity, contactId: string): Promise<TimelineEntry[]> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "contact", "read", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    // Sequential, not Promise.all: these all run on the same transaction's single pg client,
    // which cannot execute overlapping queries concurrently (node-postgres warns and queues
    // them anyway, but relying on that queuing is fragile — make the ordering explicit).
    const activityRows = await tx
      .select()
      .from(schema.activities)
      .where(and(eq(schema.activities.tenantId, identity.tenantId), eq(schema.activities.contactId, contactId)));
    const consentRows = await tx
      .select()
      .from(schema.consents)
      .where(and(eq(schema.consents.tenantId, identity.tenantId), eq(schema.consents.contactId, contactId)));
    const roleRows = await tx
      .select()
      .from(schema.contactRoles)
      .where(and(eq(schema.contactRoles.tenantId, identity.tenantId), eq(schema.contactRoles.contactId, contactId)));

    const entries: TimelineEntry[] = [
      ...activityRows.map((row) => ({
        kind: "activity" as const,
        occurred_at: row.occurredAt.toISOString(),
        summary: row.summary ?? row.type,
        ref_id: row.id,
      })),
      ...consentRows.map((row) => ({
        kind: "consent" as const,
        occurred_at: row.capturedAt.toISOString(),
        summary: `Consent ${row.status}: ${row.purpose}/${row.channel}`,
        ref_id: row.id,
      })),
      ...roleRows.map((row) => ({
        kind: "role" as const,
        occurred_at: row.validFrom.toISOString(),
        summary: `Role added: ${row.roleType}`,
        ref_id: row.id,
      })),
    ];

    return entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  });
}

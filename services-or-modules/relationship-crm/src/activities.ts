import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type Activity } from "@network-crm/contracts";
import { requireObjectAccess } from "@network-crm/access";
import { mapActivity } from "./mappers.js";

export interface LogActivityInput {
  type: string;
  summary?: string;
  occurredAt?: string;
}

/** ENT-016: immutable fact feeding the unified Contact timeline (FR-CONTACT-003). */
export async function logActivity(
  db: Database,
  identity: ActingIdentity,
  contactId: string,
  input: LogActivityInput,
  correlationId: string,
): Promise<Activity> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "activity", "create", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.activities)
      .values({
        id: randomUUID(),
        tenantId: identity.tenantId,
        contactId,
        actorUserId: identity.actorUserId,
        type: input.type,
        summary: input.summary ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        source: "manual",
        correlationId,
      })
      .returning();
    return mapActivity(row!);
  });
}

export async function listActivities(db: Database, identity: ActingIdentity, contactId: string): Promise<Activity[]> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "activity", "read", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.activities)
      .where(and(eq(schema.activities.tenantId, identity.tenantId), eq(schema.activities.contactId, contactId)))
      .orderBy(desc(schema.activities.occurredAt));
    return rows.map(mapActivity);
  });
}

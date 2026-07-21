import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { makeEnvelope, publish } from "@network-crm/eventing";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type Consent, type ConsentStatus } from "@network-crm/contracts";
import { requireObjectAccess } from "./access.js";
import { mapConsent } from "./mappers.js";

export interface RecordConsentInput {
  purpose: string;
  channel: string;
  status: ConsentStatus;
  evidence?: Record<string, unknown>;
}

/** SEC-011: Consent by purpose/channel/version/evidence; withdrawal applied without delay. */
export async function recordConsent(
  db: Database,
  identity: ActingIdentity,
  contactId: string,
  input: RecordConsentInput,
  correlationId: string,
): Promise<Consent> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "consent", "create", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const now = new Date();
    const [row] = await tx
      .insert(schema.consents)
      .values({
        id: randomUUID(),
        tenantId: identity.tenantId,
        contactId,
        purpose: input.purpose,
        channel: input.channel,
        status: input.status,
        capturedAt: now,
        effectiveAt: now,
        evidence: input.evidence ?? null,
        createdBy: identity.actorUserId,
      })
      .returning();

    await publish(
      tx,
      makeEnvelope({
        eventType: "EVT-018-ConsentChanged",
        tenantId: identity.tenantId,
        aggregateType: "Contact",
        aggregateId: contactId,
        aggregateVersion: contact.version,
        correlationId,
        producer: "relationship-crm",
        payload: { contact_id: contactId, purpose: input.purpose, channel: input.channel, status: input.status, effective_at: now.toISOString() },
      }),
    );

    return mapConsent(row!);
  });
}

export async function listConsents(db: Database, identity: ActingIdentity, contactId: string): Promise<Consent[]> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "consent", "read", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.consents)
      .where(and(eq(schema.consents.tenantId, identity.tenantId), eq(schema.consents.contactId, contactId)))
      .orderBy(desc(schema.consents.capturedAt));
    return rows.map(mapConsent);
  });
}

/**
 * BRULE-CONSENT-001: the latest consent record for this purpose+channel determines current
 * status — a later withdrawal always overrides an earlier grant. Exposed as a primitive for
 * modules that gate outbound communication (none exist yet in this stage).
 */
export async function hasActiveConsent(
  tx: Database,
  contactId: string,
  purpose: string,
  channel: string,
): Promise<boolean> {
  const [latest] = await tx
    .select({ status: schema.consents.status })
    .from(schema.consents)
    .where(and(eq(schema.consents.contactId, contactId), eq(schema.consents.purpose, purpose), eq(schema.consents.channel, channel)))
    .orderBy(desc(schema.consents.effectiveAt))
    .limit(1);
  return latest?.status === "granted";
}

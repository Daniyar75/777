import { and, eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { recordAuditEntry } from "@network-crm/governance";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type Contact, type DuplicateCandidate, type MergeContactsRequest } from "@network-crm/contracts";
import { requireObjectAccess } from "@network-crm/access";
import { findDuplicateCandidates } from "./dedupe.js";
import { mapContact } from "./mappers.js";

async function fetchContact(db: Database, tenantId: string, contactId: string) {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
}

/** Candidates for merging INTO this contact — same matching as create-time dedupe, self excluded. */
export async function listContactDuplicates(db: Database, identity: ActingIdentity, contactId: string): Promise<DuplicateCandidate[]> {
  const contact = await fetchContact(db, identity.tenantId, contactId);
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "contact", "read", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const candidates = await findDuplicateCandidates(tx, {
      normalizedPhone: contact.normalizedPhone,
      normalizedEmail: contact.normalizedEmail,
      externalId: contact.externalId,
    });
    return candidates.filter((c) => c.contact_id !== contactId);
  });
}

/**
 * FR-CONTACT-005: merges `duplicate_contact_id` into `survivorId`, keeping shared identity and
 * history — the merged record is archived and its merged_into_id set (BR-024's reversible
 * "alias/map"), never hard-deleted. Roles/consents/activities transfer to the survivor; a role
 * type the survivor already holds actively is not duplicated, the losing side's copy is closed
 * instead. Financial records are excluded from auto-merge per FR-CONTACT-005 — not yet
 * applicable (no Order/Payment exists in this stage), noted here for when Commerce ships.
 */
export async function mergeContacts(
  db: Database,
  identity: ActingIdentity,
  survivorId: string,
  input: MergeContactsRequest,
  correlationId: string,
): Promise<Contact> {
  if (survivorId === input.duplicate_contact_id) {
    throw new DomainError("VALIDATION_FAILED", "Cannot merge a contact into itself");
  }

  const survivor = await fetchContact(db, identity.tenantId, survivorId);
  if (!survivor) throw new DomainError("NOT_FOUND", `Contact ${survivorId} not found`);
  const duplicate = await fetchContact(db, identity.tenantId, input.duplicate_contact_id);
  if (!duplicate) throw new DomainError("NOT_FOUND", `Contact ${input.duplicate_contact_id} not found`);

  await requireObjectAccess(db, identity, "contact", "merge", { ownerUserId: survivor.ownerUserId });

  if (survivor.status !== "active" || survivor.mergedIntoId) {
    throw new DomainError("VALIDATION_FAILED", "Survivor contact must be active and not itself a merged record");
  }
  if (duplicate.status !== "active" || duplicate.mergedIntoId) {
    throw new DomainError("VALIDATION_FAILED", "Duplicate contact is already archived or merged");
  }

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const resolutions = input.field_resolutions ?? {};
    const resolvedValues = {
      displayName: resolutions.display_name ?? survivor.displayName,
      fullName: resolutions.full_name !== undefined ? resolutions.full_name : survivor.fullName,
      source: resolutions.source !== undefined ? resolutions.source : survivor.source,
      externalId: resolutions.external_id !== undefined ? resolutions.external_id : survivor.externalId,
    };

    const [updatedSurvivor] = await tx
      .update(schema.contacts)
      .set({ ...resolvedValues, updatedAt: new Date() })
      .where(eq(schema.contacts.id, survivorId))
      .returning();

    await tx
      .update(schema.contacts)
      .set({ status: "archived", archivedAt: new Date(), mergedIntoId: survivorId, updatedAt: new Date() })
      .where(eq(schema.contacts.id, input.duplicate_contact_id));

    // Roles: keep the survivor's own active role if both sides hold the same type (the DB's
    // one-active-role-per-type index would reject repointing a colliding one anyway); the
    // losing side's copy is closed rather than silently dropped, preserving its history.
    const duplicateActiveRoles = await tx
      .select()
      .from(schema.contactRoles)
      .where(
        and(
          eq(schema.contactRoles.tenantId, identity.tenantId),
          eq(schema.contactRoles.contactId, input.duplicate_contact_id),
          eq(schema.contactRoles.status, "active"),
        ),
      );
    const survivorActiveRoles = await tx
      .select()
      .from(schema.contactRoles)
      .where(
        and(
          eq(schema.contactRoles.tenantId, identity.tenantId),
          eq(schema.contactRoles.contactId, survivorId),
          eq(schema.contactRoles.status, "active"),
        ),
      );
    const survivorRoleTypes = new Set(survivorActiveRoles.map((r) => r.roleType));
    for (const role of duplicateActiveRoles) {
      if (survivorRoleTypes.has(role.roleType)) {
        await tx
          .update(schema.contactRoles)
          .set({ status: "inactive", validTo: new Date(), updatedAt: new Date() })
          .where(eq(schema.contactRoles.id, role.id));
      } else {
        await tx
          .update(schema.contactRoles)
          .set({ contactId: survivorId, updatedAt: new Date() })
          .where(eq(schema.contactRoles.id, role.id));
        survivorRoleTypes.add(role.roleType);
      }
    }

    // Consents and activities carry their own history rows already (no active/inactive
    // exclusivity like roles), so they transfer unconditionally.
    await tx
      .update(schema.consents)
      .set({ contactId: survivorId })
      .where(and(eq(schema.consents.tenantId, identity.tenantId), eq(schema.consents.contactId, input.duplicate_contact_id)));
    await tx
      .update(schema.activities)
      .set({ contactId: survivorId })
      .where(and(eq(schema.activities.tenantId, identity.tenantId), eq(schema.activities.contactId, input.duplicate_contact_id)));

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "contact.merged",
      resource_type: "contact",
      resource_id: survivorId,
      before: { duplicate_contact_id: input.duplicate_contact_id, duplicate_display_name: duplicate.displayName },
      after: { merged_contact_id: input.duplicate_contact_id, resolved_fields: resolvedValues },
      reason: null,
      correlation_id: correlationId,
    });

    return mapContact(updatedSurvivor!);
  });
}

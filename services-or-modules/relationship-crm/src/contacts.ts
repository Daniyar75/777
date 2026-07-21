import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { makeEnvelope, publish } from "@network-crm/eventing";
import { recordAuditEntry } from "@network-crm/governance";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type Contact, type ContactRole, type ContactRoleType } from "@network-crm/contracts";
import { requireObjectAccess, resolveBestScope } from "@network-crm/access";
import { findDuplicateCandidates } from "./dedupe.js";
import { mapContact, mapContactRole } from "./mappers.js";
import { normalizeEmail, normalizePhone } from "./normalize.js";

export interface CreateContactInput {
  display_name: string;
  full_name?: string;
  source?: string;
  phone?: string;
  email?: string;
  external_id?: string;
  confirm_despite_duplicates?: boolean;
}

/**
 * BR-001/FR-CONTACT-001: creates a Contact. Runs duplicate detection before persisting
 * (BRULE-CONTACT-003, ACC-001) — a caller that hasn't reviewed candidates gets a
 * DUPLICATE_CONTACT error carrying them, never a silent second record.
 */
export async function createContact(
  db: Database,
  identity: ActingIdentity,
  input: CreateContactInput,
  correlationId: string,
): Promise<Contact> {
  // "owned" is satisfiable for a not-yet-created row because the actor is about to become its
  // owner; a role scoped narrower than the actor's own creation (e.g. never granted contact.create
  // at all) is denied before any duplicate check runs.
  await requireObjectAccess(db, identity, "contact", "create", { ownerUserId: identity.actorUserId });

  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;
  const normalizedEmail = input.email ? normalizeEmail(input.email) : null;

  return withTenantContext(db, identity.tenantId, async (tx) => {
    if (!input.confirm_despite_duplicates) {
      const duplicates = await findDuplicateCandidates(tx, {
        normalizedPhone,
        normalizedEmail,
        externalId: input.external_id ?? null,
      });
      if (duplicates.length > 0) {
        throw new DomainError(
          "DUPLICATE_CONTACT",
          "Possible duplicate contact(s) found; resubmit with confirm_despite_duplicates to proceed anyway",
          { candidates: duplicates },
        );
      }
    }

    const id = randomUUID();
    const [row] = await tx
      .insert(schema.contacts)
      .values({
        id,
        tenantId: identity.tenantId,
        ownerUserId: identity.actorUserId,
        displayName: input.display_name,
        fullName: input.full_name ?? null,
        source: input.source ?? null,
        normalizedPhone,
        normalizedEmail,
        externalId: input.external_id ?? null,
        status: "active",
        createdBy: identity.actorUserId,
      })
      .returning();

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "contact.created",
      resource_type: "contact",
      resource_id: id,
      before: null,
      after: { display_name: input.display_name, source: input.source ?? null },
      reason: null,
      correlation_id: correlationId,
    });

    await publish(
      tx,
      makeEnvelope({
        eventType: "EVT-001-ContactCreated",
        tenantId: identity.tenantId,
        aggregateType: "Contact",
        aggregateId: id,
        aggregateVersion: 0,
        correlationId,
        producer: "relationship-crm",
        payload: { contact_id: id, source: input.source ?? "manual", owner: identity.actorUserId },
      }),
    );

    return mapContact(row!);
  });
}

export async function getContact(db: Database, identity: ActingIdentity, contactId: string): Promise<Contact> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) {
    throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  }
  await requireObjectAccess(db, identity, "contact", "read", { ownerUserId: contact.ownerUserId });
  return mapContact(contact);
}

export interface ListContactsResult {
  items: Contact[];
  nextCursor: string | null;
}

/**
 * List scoping (roles-and-permissions.md §2): tenant/platform scope sees the whole tenant;
 * owned scope is filtered to the actor's own contacts; narrower scopes (self/assigned/
 * mentored/branch) aren't meaningful for Contact ownership yet — no assignment/mentor/branch
 * relationship exists on this entity in Stage 2 — so they resolve to "no contacts visible"
 * rather than guessing a wider filter (deny-by-default, ADR-0004).
 */
export async function listContacts(
  db: Database,
  identity: ActingIdentity,
  options: { pageSize?: number; cursor?: string } = {},
): Promise<ListContactsResult> {
  const scope = await resolveBestScope(db, identity, "contact", "read");
  if (!scope) {
    throw new DomainError("PERMISSION_DENIED", "Not permitted: contact.read");
  }

  const pageSize = Math.min(options.pageSize ?? 50, 200);

  return withTenantContext(db, identity.tenantId, async (tx) => {
    if (scope !== "tenant" && scope !== "platform" && scope !== "owned") {
      return { items: [], nextCursor: null };
    }
    const ownerFilter = scope === "owned" ? eq(schema.contacts.ownerUserId, identity.actorUserId) : undefined;
    const rows = await tx
      .select()
      .from(schema.contacts)
      .where(ownerFilter)
      .orderBy(schema.contacts.createdAt)
      .limit(pageSize + 1);
    const page = rows.slice(0, pageSize);
    return {
      items: page.map(mapContact),
      nextCursor: rows.length > pageSize ? page[page.length - 1]!.id : null,
    };
  });
}

export async function archiveContact(db: Database, identity: ActingIdentity, contactId: string, correlationId: string): Promise<void> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "contact", "archive", { ownerUserId: contact.ownerUserId });

  await withTenantContext(db, identity.tenantId, async (tx) => {
    await tx
      .update(schema.contacts)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.contacts.id, contactId));
    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "contact.archived",
      resource_type: "contact",
      resource_id: contactId,
      before: { status: contact.status },
      after: { status: "archived" },
      reason: null,
      correlation_id: correlationId,
    });
  });
}

/**
 * BR-001/BRULE-CONTACT-001: adds a role without duplicating shared identity/history. Only one
 * *active* role of a given type per contact at a time (DB partial unique index); re-adding a
 * role type that is currently active is rejected rather than silently duplicated.
 */
export async function addContactRole(
  db: Database,
  identity: ActingIdentity,
  contactId: string,
  roleType: ContactRoleType,
  correlationId: string,
): Promise<ContactRole> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "contact", "update", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    let row: typeof schema.contactRoles.$inferSelect | undefined;
    try {
      const inserted = await tx
        .insert(schema.contactRoles)
        .values({ id: randomUUID(), tenantId: identity.tenantId, contactId, roleType, status: "active" })
        .returning();
      row = inserted[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DomainError("VALIDATION_FAILED", `Contact already has an active "${roleType}" role`);
      }
      throw err;
    }

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "contact.role_added",
      resource_type: "contact",
      resource_id: contactId,
      before: null,
      after: { role_type: roleType },
      reason: null,
      correlation_id: correlationId,
    });

    return mapContactRole(row!);
  });
}

export async function listContactRoles(db: Database, identity: ActingIdentity, contactId: string): Promise<ContactRole[]> {
  const contact = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return row;
  });
  if (!contact) throw new DomainError("NOT_FOUND", `Contact ${contactId} not found`);
  await requireObjectAccess(db, identity, "contact", "read", { ownerUserId: contact.ownerUserId });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.contactRoles)
      .where(and(eq(schema.contactRoles.tenantId, identity.tenantId), eq(schema.contactRoles.contactId, contactId)));
    return rows.map(mapContactRole);
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}

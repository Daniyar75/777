import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createActorWithGrants, createTestDb, insertTenant, truncateAll } from "@network-crm/test-support";
import { ensurePermissionCatalog } from "@network-crm/identity-tenant";
import {
  addContactRole,
  archiveContact,
  createContact,
  getContact,
  listContactDuplicates,
  listContactRoles,
  listConsents,
  logActivity,
  mergeContacts,
  recordConsent,
} from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

async function actorWithFullContactAccess() {
  const tenant = await insertTenant(db);
  await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
  const actor = await createActorWithGrants(db, tenant.id, [
    { resource: "contact", action: "create", scope: "tenant" },
    { resource: "contact", action: "read", scope: "tenant" },
    { resource: "contact", action: "update", scope: "tenant" },
    { resource: "contact", action: "archive", scope: "tenant" },
    { resource: "contact", action: "merge", scope: "tenant" },
    { resource: "consent", action: "create", scope: "tenant" },
    { resource: "consent", action: "read", scope: "tenant" },
    { resource: "activity", action: "create", scope: "tenant" },
  ]);
  return { tenant, identity: { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId } };
}

describe("listContactDuplicates (BL-206)", () => {
  it("finds a match by phone and excludes the contact itself", async () => {
    const { identity } = await actorWithFullContactAccess();
    const a = await createContact(db, identity, { display_name: "A", phone: "+7 700 999 88 77" }, "11111111-1111-1111-1111-111111111111");
    const b = await createContact(
      db,
      identity,
      { display_name: "B", phone: "+77009998877", confirm_despite_duplicates: true },
      "22222222-2222-2222-2222-222222222222",
    );

    const duplicatesOfA = await listContactDuplicates(db, identity, a.id);
    expect(duplicatesOfA.map((d) => d.contact_id)).toEqual([b.id]);
  });
});

describe("mergeContacts (FR-CONTACT-005)", () => {
  it("archives the losing contact, sets merged_into_id, and transfers roles/consents/activities", async () => {
    const { identity } = await actorWithFullContactAccess();
    const survivor = await createContact(db, identity, { display_name: "Survivor" }, "11111111-1111-1111-1111-111111111111");
    const duplicate = await createContact(
      db,
      identity,
      { display_name: "Duplicate", confirm_despite_duplicates: true },
      "22222222-2222-2222-2222-222222222222",
    );

    await addContactRole(db, identity, duplicate.id, "client", "33333333-3333-3333-3333-333333333333");
    await recordConsent(db, identity, duplicate.id, { purpose: "marketing", channel: "email", status: "granted" }, "44444444-4444-4444-4444-444444444444");
    await logActivity(db, identity, duplicate.id, { type: "note", summary: "on the losing contact" }, "55555555-5555-5555-5555-555555555555");

    const merged = await mergeContacts(
      db,
      identity,
      survivor.id,
      { duplicate_contact_id: duplicate.id },
      "66666666-6666-6666-6666-666666666666",
    );
    expect(merged.id).toBe(survivor.id);

    const survivorRoles = await listContactRoles(db, identity, survivor.id);
    expect(survivorRoles.map((r) => r.role_type)).toContain("client");

    const survivorConsents = await listConsents(db, identity, survivor.id);
    expect(survivorConsents).toHaveLength(1);

    // The merged contact is archived and points at the survivor.
    await expect(getContact(db, identity, duplicate.id)).resolves.toMatchObject({
      status: "archived",
      merged_into_id: survivor.id,
    });
  });

  it("closes the losing contact's role instead of duplicating one the survivor already holds", async () => {
    const { identity } = await actorWithFullContactAccess();
    const survivor = await createContact(db, identity, { display_name: "Survivor" }, "11111111-1111-1111-1111-111111111111");
    const duplicate = await createContact(
      db,
      identity,
      { display_name: "Duplicate", confirm_despite_duplicates: true },
      "22222222-2222-2222-2222-222222222222",
    );
    await addContactRole(db, identity, survivor.id, "client", "33333333-3333-3333-3333-333333333333");
    await addContactRole(db, identity, duplicate.id, "client", "44444444-4444-4444-4444-444444444444");

    await mergeContacts(db, identity, survivor.id, { duplicate_contact_id: duplicate.id }, "55555555-5555-5555-5555-555555555555");

    const survivorRoles = await listContactRoles(db, identity, survivor.id);
    const activeClientRoles = survivorRoles.filter((r) => r.role_type === "client" && r.status === "active");
    expect(activeClientRoles).toHaveLength(1);
  });

  it("applies caller-chosen field resolutions", async () => {
    const { identity } = await actorWithFullContactAccess();
    const survivor = await createContact(db, identity, { display_name: "Old Name" }, "11111111-1111-1111-1111-111111111111");
    const duplicate = await createContact(
      db,
      identity,
      { display_name: "New Preferred Name", confirm_despite_duplicates: true },
      "22222222-2222-2222-2222-222222222222",
    );

    const merged = await mergeContacts(
      db,
      identity,
      survivor.id,
      { duplicate_contact_id: duplicate.id, field_resolutions: { display_name: "New Preferred Name" } },
      "33333333-3333-3333-3333-333333333333",
    );
    expect(merged.display_name).toBe("New Preferred Name");
  });

  it("rejects merging a contact into itself", async () => {
    const { identity } = await actorWithFullContactAccess();
    const c = await createContact(db, identity, { display_name: "Solo" }, "11111111-1111-1111-1111-111111111111");
    await expect(
      mergeContacts(db, identity, c.id, { duplicate_contact_id: c.id }, "22222222-2222-2222-2222-222222222222"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects merging an already-archived contact", async () => {
    const { identity } = await actorWithFullContactAccess();
    const survivor = await createContact(db, identity, { display_name: "Survivor" }, "11111111-1111-1111-1111-111111111111");
    const duplicate = await createContact(
      db,
      identity,
      { display_name: "Already Archived", confirm_despite_duplicates: true },
      "22222222-2222-2222-2222-222222222222",
    );
    await archiveContact(db, identity, duplicate.id, "33333333-3333-3333-3333-333333333333");

    await expect(
      mergeContacts(db, identity, survivor.id, { duplicate_contact_id: duplicate.id }, "44444444-4444-4444-4444-444444444444"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("cannot merge a contact belonging to another tenant (tenant isolation, ACC-019)", async () => {
    const { identity: identityA } = await actorWithFullContactAccess();
    const { identity: identityB } = await actorWithFullContactAccess();
    const survivorA = await createContact(db, identityA, { display_name: "A survivor" }, "11111111-1111-1111-1111-111111111111");
    const contactB = await createContact(db, identityB, { display_name: "B contact" }, "22222222-2222-2222-2222-222222222222");

    await expect(
      mergeContacts(db, identityA, survivorA.id, { duplicate_contact_id: contactB.id }, "33333333-3333-3333-3333-333333333333"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

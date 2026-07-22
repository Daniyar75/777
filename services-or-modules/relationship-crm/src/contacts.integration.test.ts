import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createActorWithGrants, createTestDb, insertTenant, truncateAll } from "@network-crm/test-support";
import { ensurePermissionCatalog } from "@network-crm/identity-tenant";
import { addContactRole, createContact, getContact, listContacts, listContactRoles } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

async function setupTenantWithCatalog() {
  const tenant = await insertTenant(db);
  await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
  return tenant;
}

describe("createContact (BR-001, BRULE-CONTACT-003)", () => {
  it("creates a contact for an actor with owned scope", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [{ resource: "contact", action: "create", scope: "owned" }]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };

    const contact = await createContact(db, identity, { display_name: "Ivan Ivanov", phone: "+7 700 123 45 67" }, "11111111-1111-1111-1111-111111111111");
    expect(contact.display_name).toBe("Ivan Ivanov");
    expect(contact.owner_user_id).toBe(actor.userId);
    expect(contact.normalized_phone).toBe("77001234567");
  });

  it("denies an actor without contact.create", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [{ resource: "contact", action: "read", scope: "owned" }]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };

    await expect(
      createContact(db, identity, { display_name: "Nobody" }, "11111111-1111-1111-1111-111111111111"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("surfaces duplicate candidates instead of silently creating a second record (ACC-001)", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [{ resource: "contact", action: "create", scope: "owned" }]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };

    const first = await createContact(db, identity, { display_name: "Ivan Ivanov", phone: "+7 (700) 123-45-67" }, "11111111-1111-1111-1111-111111111111");

    // same digits, different formatting — normalizePhone strips punctuation/spacing only
    // (it is not a full E.164 parser, see normalize.ts), so this still matches on digits.
    const attempt = createContact(db, identity, { display_name: "Ivan I.", phone: "+77001234567" }, "22222222-2222-2222-2222-222222222222");
    await expect(attempt).rejects.toMatchObject({ code: "DUPLICATE_CONTACT" });

    // caller reviewed the candidate and explicitly confirms creation anyway
    const confirmed = await createContact(
      db,
      identity,
      { display_name: "Ivan I. (duplicate confirmed)", phone: "+77001234567", confirm_despite_duplicates: true },
      "33333333-3333-3333-3333-333333333333",
    );
    expect(confirmed.id).not.toBe(first.id);
  });
});

describe("addContactRole (BRULE-CONTACT-001: multi-role, one shared history)", () => {
  it("allows several simultaneous roles and rejects a duplicate active role of the same type", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "contact", action: "create", scope: "owned" },
      { resource: "contact", action: "update", scope: "owned" },
      { resource: "contact", action: "read", scope: "owned" },
    ]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };
    const contact = await createContact(db, identity, { display_name: "Multi Role" }, "11111111-1111-1111-1111-111111111111");

    await addContactRole(db, identity, contact.id, "client", "22222222-2222-2222-2222-222222222222");
    await addContactRole(db, identity, contact.id, "candidate", "33333333-3333-3333-3333-333333333333");

    const roles = await listContactRoles(db, identity, contact.id);
    expect(roles.map((r) => r.role_type).sort()).toEqual(["candidate", "client"]);

    await expect(
      addContactRole(db, identity, contact.id, "client", "44444444-4444-4444-4444-444444444444"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("listContacts scoping (roles-and-permissions.md §2)", () => {
  it("tenant scope sees every contact; owned scope sees only the actor's own", async () => {
    const tenant = await setupTenantWithCatalog();
    const admin = await createActorWithGrants(db, tenant.id, [
      { resource: "contact", action: "create", scope: "tenant" },
      { resource: "contact", action: "read", scope: "tenant" },
    ]);
    const adminIdentity = { tenantId: tenant.id, actorUserId: admin.userId, membershipId: admin.membershipId };
    const partner = await createActorWithGrants(db, tenant.id, [
      { resource: "contact", action: "create", scope: "owned" },
      { resource: "contact", action: "read", scope: "owned" },
    ]);
    const partnerIdentity = { tenantId: tenant.id, actorUserId: partner.userId, membershipId: partner.membershipId };

    await createContact(db, adminIdentity, { display_name: "Admin's contact" }, "11111111-1111-1111-1111-111111111111");
    await createContact(db, partnerIdentity, { display_name: "Partner's contact" }, "22222222-2222-2222-2222-222222222222");

    const adminView = await listContacts(db, adminIdentity);
    expect(adminView.items.map((c) => c.display_name).sort()).toEqual(["Admin's contact", "Partner's contact"]);

    const partnerView = await listContacts(db, partnerIdentity);
    expect(partnerView.items.map((c) => c.display_name)).toEqual(["Partner's contact"]);
  });
});

describe("tenant isolation (ACC-019, threat-model.md §2.1)", () => {
  it("a contact from tenant A is invisible (NOT_FOUND) to an actor in tenant B", async () => {
    const tenantA = await setupTenantWithCatalog();
    const tenantB = await setupTenantWithCatalog();
    const actorA = await createActorWithGrants(db, tenantA.id, [
      { resource: "contact", action: "create", scope: "owned" },
      { resource: "contact", action: "read", scope: "owned" },
    ]);
    const identityA = { tenantId: tenantA.id, actorUserId: actorA.userId, membershipId: actorA.membershipId };
    const contact = await createContact(db, identityA, { display_name: "Tenant A only" }, "11111111-1111-1111-1111-111111111111");

    const actorB = await createActorWithGrants(db, tenantB.id, [{ resource: "contact", action: "read", scope: "tenant" }]);
    const identityB = { tenantId: tenantB.id, actorUserId: actorB.userId, membershipId: actorB.membershipId };

    await expect(getContact(db, identityB, contact.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

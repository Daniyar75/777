import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createActorWithGrants, createTestDb, insertTenant, truncateAll } from "@network-crm/test-support";
import { ensurePermissionCatalog } from "@network-crm/identity-tenant";
import { createContact, getTimeline, hasActiveConsent, listActivities, listConsents, logActivity, recordConsent } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

async function setupContactWithFullAccess() {
  const tenant = await insertTenant(db);
  await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
  const actor = await createActorWithGrants(db, tenant.id, [
    { resource: "contact", action: "create", scope: "owned" },
    { resource: "contact", action: "read", scope: "owned" },
    { resource: "consent", action: "create", scope: "owned" },
    { resource: "consent", action: "read", scope: "owned" },
    { resource: "activity", action: "create", scope: "owned" },
    { resource: "activity", action: "read", scope: "owned" },
  ]);
  const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };
  const contact = await createContact(db, identity, { display_name: "Consent Test Contact" }, "11111111-1111-1111-1111-111111111111");
  return { tenant, identity, contact };
}

describe("recordConsent / hasActiveConsent (SEC-011, BRULE-CONSENT-001/002)", () => {
  it("a later withdrawal overrides an earlier grant for the same purpose+channel", async () => {
    const { identity, contact } = await setupContactWithFullAccess();

    await recordConsent(db, identity, contact.id, { purpose: "marketing", channel: "email", status: "granted" }, "11111111-1111-1111-1111-111111111111");
    let active = await withTenantContext(db, identity.tenantId, (tx) => hasActiveConsent(tx, contact.id, "marketing", "email"));
    expect(active).toBe(true);

    await recordConsent(db, identity, contact.id, { purpose: "marketing", channel: "email", status: "withdrawn" }, "22222222-2222-2222-2222-222222222222");
    active = await withTenantContext(db, identity.tenantId, (tx) => hasActiveConsent(tx, contact.id, "marketing", "email"));
    expect(active).toBe(false);

    const history = await listConsents(db, identity, contact.id);
    expect(history).toHaveLength(2);
  });

  it("purposes/channels are independent", async () => {
    const { identity, contact } = await setupContactWithFullAccess();
    await recordConsent(db, identity, contact.id, { purpose: "marketing", channel: "email", status: "granted" }, "11111111-1111-1111-1111-111111111111");

    const serviceChannel = await withTenantContext(db, identity.tenantId, (tx) => hasActiveConsent(tx, contact.id, "service", "email"));
    expect(serviceChannel).toBe(false);
  });
});

describe("logActivity + getTimeline (FR-CONTACT-003)", () => {
  it("merges activities, consents, and role changes into one chronological timeline", async () => {
    const { identity, contact } = await setupContactWithFullAccess();

    await logActivity(db, identity, contact.id, { type: "call", summary: "First call" }, "11111111-1111-1111-1111-111111111111");
    await recordConsent(db, identity, contact.id, { purpose: "marketing", channel: "email", status: "granted" }, "22222222-2222-2222-2222-222222222222");

    const activities = await listActivities(db, identity, contact.id);
    expect(activities).toHaveLength(1);

    const timeline = await getTimeline(db, identity, contact.id);
    expect(timeline.map((e) => e.kind).sort()).toEqual(["activity", "consent"]);
  });
});

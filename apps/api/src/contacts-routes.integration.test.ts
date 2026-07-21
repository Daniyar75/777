import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, truncateAll } from "@network-crm/test-support";
import { buildApp } from "./app.js";

const { db, close } = createTestDb();
const PROVISIONING_KEY = "test-provisioning-key";
const app = buildApp({ db, jwtSecret: "test-secret", provisioningKey: PROVISIONING_KEY });

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await app.close();
  await close();
});

async function provisionAndLogin(slug: string, adminEmail: string) {
  const provisionRes = await app.inject({
    method: "POST",
    url: "/tenants",
    headers: { "x-platform-provisioning-key": PROVISIONING_KEY },
    payload: { name: `Tenant ${slug}`, slug, default_locale: "ru", timezone: "UTC", admin_email: adminEmail },
  });
  expect(provisionRes.statusCode).toBe(201);
  const provisioned = provisionRes.json();

  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { login_identity: adminEmail, password: provisioned.temporary_password },
  });
  const { access_token } = loginRes.json();

  const switchRes = await app.inject({
    method: "POST",
    url: "/auth/switch-tenant",
    headers: { authorization: `Bearer ${access_token}` },
    payload: { tenant_id: provisioned.tenant.id },
  });
  expect(switchRes.statusCode).toBe(200);
  return { tenant: provisioned.tenant, session: switchRes.json() as { access_token: string } };
}

describe("Contact routes end to end (BL-201..205)", () => {
  it("creates a contact, blocks a duplicate, adds a role, records consent, logs an activity, and shows them in the timeline", async () => {
    const { session } = await provisionAndLogin("acme-crm", "admin@acme-crm.test");
    const auth = { authorization: `Bearer ${session.access_token}` };

    const createRes = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth,
      payload: { display_name: "Ivan Ivanov", phone: "+7 700 123 45 67" },
    });
    expect(createRes.statusCode).toBe(201);
    const contact = createRes.json();

    const dupRes = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth,
      payload: { display_name: "Ivan I.", phone: "+77001234567" },
    });
    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().code).toBe("DUPLICATE_CONTACT");
    expect(dupRes.json().details.candidates).toHaveLength(1);

    const roleRes = await app.inject({
      method: "POST",
      url: `/contacts/${contact.id}/roles`,
      headers: auth,
      payload: { role_type: "candidate" },
    });
    expect(roleRes.statusCode).toBe(201);

    const consentRes = await app.inject({
      method: "POST",
      url: `/contacts/${contact.id}/consents`,
      headers: auth,
      payload: { purpose: "marketing", channel: "email", status: "granted" },
    });
    expect(consentRes.statusCode).toBe(201);

    const activityRes = await app.inject({
      method: "POST",
      url: `/contacts/${contact.id}/activities`,
      headers: auth,
      payload: { type: "call", summary: "Intro call" },
    });
    expect(activityRes.statusCode).toBe(201);

    const timelineRes = await app.inject({
      method: "GET",
      url: `/contacts/${contact.id}/timeline`,
      headers: auth,
    });
    expect(timelineRes.statusCode).toBe(200);
    const kinds = timelineRes.json().items.map((e: { kind: string }) => e.kind).sort();
    expect(kinds).toEqual(["activity", "consent", "role"]);
  });

  it("keeps contacts tenant-isolated over HTTP", async () => {
    const tenantA = await provisionAndLogin("tenant-a-crm", "admin-a@example.test");
    const tenantB = await provisionAndLogin("tenant-b-crm", "admin-b@example.test");

    const createRes = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: { authorization: `Bearer ${tenantA.session.access_token}` },
      payload: { display_name: "Tenant A Contact" },
    });
    const contact = createRes.json();

    const getFromB = await app.inject({
      method: "GET",
      url: `/contacts/${contact.id}`,
      headers: { authorization: `Bearer ${tenantB.session.access_token}` },
    });
    expect(getFromB.statusCode).toBe(404);
    expect(getFromB.json().code).toBe("NOT_FOUND");

    const listFromB = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: { authorization: `Bearer ${tenantB.session.access_token}` },
    });
    expect(listFromB.json().items).toHaveLength(0);
  });
});

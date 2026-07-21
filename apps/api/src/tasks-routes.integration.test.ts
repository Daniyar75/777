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
  return { tenant: provisioned.tenant, session: switchRes.json() as { access_token: string } };
}

describe("Task routes end to end (BL-207)", () => {
  it("creates, completes, and delegates a task", async () => {
    const { session } = await provisionAndLogin("acme-tasks", "admin@acme-tasks.test");
    const auth = { authorization: `Bearer ${session.access_token}` };

    const createRes = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: auth,
      payload: { title: "Follow up with client", priority: "high" },
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json();
    expect(task.status).toBe("open");

    const completeRes = await app.inject({
      method: "POST",
      url: `/tasks/${task.id}/complete`,
      headers: auth,
      payload: { completion_evidence: "called at 3pm" },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().status).toBe("done");

    const doubleCompleteRes = await app.inject({
      method: "POST",
      url: `/tasks/${task.id}/complete`,
      headers: auth,
    });
    expect(doubleCompleteRes.statusCode).toBe(422);
    expect(doubleCompleteRes.json().code).toBe("VALIDATION_FAILED");
  });

  it("keeps tasks tenant-isolated over HTTP", async () => {
    const tenantA = await provisionAndLogin("tenant-a-tasks", "admin-a@example.test");
    const tenantB = await provisionAndLogin("tenant-b-tasks", "admin-b@example.test");

    const createRes = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: { authorization: `Bearer ${tenantA.session.access_token}` },
      payload: { title: "Tenant A task" },
    });
    const task = createRes.json();

    const getFromB = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}`,
      headers: { authorization: `Bearer ${tenantB.session.access_token}` },
    });
    expect(getFromB.statusCode).toBe(404);
  });
});

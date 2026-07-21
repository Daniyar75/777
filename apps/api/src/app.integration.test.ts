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

async function provisionTenant(slug: string, adminEmail: string) {
  const res = await app.inject({
    method: "POST",
    url: "/tenants",
    headers: { "x-platform-provisioning-key": PROVISIONING_KEY },
    payload: { name: `Tenant ${slug}`, slug, default_locale: "ru", timezone: "UTC", admin_email: adminEmail },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as {
    tenant: { id: string; slug: string };
    admin_user: { id: string; login_identity: string };
    temporary_password: string;
  };
}

async function loginAndSwitch(adminEmail: string, password: string, tenantId: string) {
  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { login_identity: adminEmail, password },
  });
  expect(loginRes.statusCode).toBe(200);
  const loginBody = loginRes.json();
  expect(loginBody.status).toBe("authenticated");

  const switchRes = await app.inject({
    method: "POST",
    url: "/auth/switch-tenant",
    headers: { authorization: `Bearer ${loginBody.access_token}` },
    payload: { tenant_id: tenantId },
  });
  expect(switchRes.statusCode).toBe(200);
  return switchRes.json() as { access_token: string; refresh_token: string };
}

describe("POST /tenants (bootstrap gate)", () => {
  it("rejects provisioning without the platform key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { name: "X", slug: "x-co", default_locale: "ru", timezone: "UTC", admin_email: "x@example.test" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PERMISSION_DENIED");
  });
});

describe("end-to-end: provision -> login -> switch -> role admin -> audit", () => {
  it("walks the full Stage 1 happy path", async () => {
    const provisioned = await provisionTenant("acme", "admin@acme.test");
    const session = await loginAndSwitch("admin@acme.test", provisioned.temporary_password, provisioned.tenant.id);

    const createRoleRes = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { authorization: `Bearer ${session.access_token}` },
      payload: { code: "leader", name: "Leader", scope: "branch", branch_depth: 3 },
    });
    expect(createRoleRes.statusCode).toBe(201);
    const role = createRoleRes.json();

    const bindRes = await app.inject({
      method: "PUT",
      url: `/roles/${role.id}/permissions`,
      headers: { authorization: `Bearer ${session.access_token}` },
      payload: { resource: "role", action: "read", scope: "tenant" },
    });
    expect(bindRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: "/roles",
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items.map((r: { code: string }) => r.code)).toContain("leader");

    const auditRes = await app.inject({
      method: "GET",
      url: "/audit",
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const actions = auditRes.json().items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["tenant.provisioned", "role.created", "role.permissions.updated"]));
  });

  it("requires an active tenant before calling a tenant-scoped route", async () => {
    const provisioned = await provisionTenant("no-switch", "admin2@example.test");
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login_identity: "admin2@example.test", password: provisioned.temporary_password },
    });
    const { access_token } = loginRes.json();

    const rolesRes = await app.inject({
      method: "GET",
      url: "/roles",
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(rolesRes.statusCode).toBe(401);
    expect(rolesRes.json().code).toBe("AUTH_REQUIRED");
  });
});

describe("tenant isolation over HTTP (ACC-019, threat-model.md §2.1)", () => {
  it("tenant B's session cannot see tenant A's roles, and a cross-tenant role id 404s as TENANT_MISMATCH", async () => {
    const tenantA = await provisionTenant("tenant-a", "admin-a@example.test");
    const tenantB = await provisionTenant("tenant-b", "admin-b@example.test");
    const sessionA = await loginAndSwitch("admin-a@example.test", tenantA.temporary_password, tenantA.tenant.id);
    const sessionB = await loginAndSwitch("admin-b@example.test", tenantB.temporary_password, tenantB.tenant.id);

    const roleInA = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { authorization: `Bearer ${sessionA.access_token}` },
      payload: { code: "only-in-a", name: "Only In A", scope: "tenant" },
    });
    expect(roleInA.statusCode).toBe(201);

    const listFromB = await app.inject({
      method: "GET",
      url: "/roles",
      headers: { authorization: `Bearer ${sessionB.access_token}` },
    });
    expect(listFromB.statusCode).toBe(200);
    expect(listFromB.json().items.map((r: { code: string }) => r.code)).not.toContain("only-in-a");

    const bindCrossTenant = await app.inject({
      method: "PUT",
      url: `/roles/${roleInA.json().id}/permissions`,
      headers: { authorization: `Bearer ${sessionB.access_token}` },
      payload: { resource: "role", action: "read", scope: "tenant" },
    });
    // Tenant A's role id is invisible under tenant B's RLS-scoped context, so bindPermission's
    // explicit ownership check (roles.ts) reports NOT_FOUND rather than silently succeeding —
    // this is the regression test for a real cross-tenant IDOR this suite caught (a plain FK
    // on role_permissions.role_id confirms existence but not tenant ownership).
    expect(bindCrossTenant.statusCode).toBe(404);
    expect(bindCrossTenant.json().code).toBe("NOT_FOUND");
  });
});

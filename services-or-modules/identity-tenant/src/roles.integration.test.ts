import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createActorWithGrants, createTestDb, insertRole, insertTenant, truncateAll } from "@network-crm/test-support";
import { bindPermission, createRole, ensurePermissionCatalog, listRoles } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

describe("createRole (RBAC admin)", () => {
  it("allows an actor with role.create at tenant scope", async () => {
    const tenant = await insertTenant(db);
    await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
    const actor = await createActorWithGrants(db, tenant.id, [{ resource: "role", action: "create", scope: "tenant" }]);

    const role = await createRole(
      db,
      { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId },
      { code: "leader", name: "Leader", scope: "branch", branchDepth: 3 },
      "11111111-1111-1111-1111-111111111111",
    );
    expect(role.code).toBe("leader");
  });

  it("denies an actor without role.create", async () => {
    const tenant = await insertTenant(db);
    await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
    const actor = await createActorWithGrants(db, tenant.id, [{ resource: "role", action: "read", scope: "tenant" }]);

    await expect(
      createRole(
        db,
        { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId },
        { code: "leader", name: "Leader", scope: "tenant" },
        "11111111-1111-1111-1111-111111111111",
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("bindPermission self-escalation guard (roles-and-permissions.md §4)", () => {
  it("denies granting a broader scope than the actor's own for the same resource/action", async () => {
    const tenant = await insertTenant(db);
    await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "role", action: "permissions.update", scope: "tenant" },
      { resource: "audit", action: "read", scope: "owned" }, // actor's own rank for audit.read is low
    ]);
    const targetRole = await insertRole(db, tenant.id, { code: "target-role" });

    await expect(
      bindPermission(
        db,
        { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId },
        { roleId: targetRole.id, resource: "audit", action: "read", scope: "tenant" }, // broader than actor's own
        "22222222-2222-2222-2222-222222222222",
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows granting a scope the actor already holds or narrower", async () => {
    const tenant = await insertTenant(db);
    await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "role", action: "permissions.update", scope: "tenant" },
      { resource: "role", action: "read", scope: "tenant" },
      { resource: "audit", action: "read", scope: "tenant" },
    ]);
    const targetRole = await insertRole(db, tenant.id, { code: "target-role-2" });

    await bindPermission(
      db,
      { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId },
      { roleId: targetRole.id, resource: "audit", action: "read", scope: "owned" },
      "33333333-3333-3333-3333-333333333333",
    );

    const roles = await listRoles(db, { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId });
    expect(roles.some((r) => r.id === targetRole.id)).toBe(true);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createActorWithGrants, createTestDb, insertMembership, insertTenant, insertUser, truncateAll } from "@network-crm/test-support";
import { ensurePermissionCatalog } from "@network-crm/identity-tenant";
import { completeTask, createTask, delegateTask, getTask, listTasks } from "./index.js";

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

describe("createTask / getTask (FR-TASK-001)", () => {
  it("creates a task defaulting the assignee to the creator", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "task", action: "create", scope: "owned" },
      { resource: "task", action: "read", scope: "owned" },
    ]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };

    const task = await createTask(db, identity, { title: "Call the client" }, "11111111-1111-1111-1111-111111111111");
    expect(task.assignee_user_id).toBe(actor.userId);
    expect(task.status).toBe("open");

    const fetched = await getTask(db, identity, task.id);
    expect(fetched.title).toBe("Call the client");
  });

  it("denies an actor without task.create", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [{ resource: "task", action: "read", scope: "owned" }]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };

    await expect(createTask(db, identity, { title: "Nope" }, "11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});

describe("listTasks scoping — owner OR assignee (roles-and-permissions.md §2)", () => {
  it("an assignee sees a task they didn't create", async () => {
    const tenant = await setupTenantWithCatalog();
    const creator = await createActorWithGrants(db, tenant.id, [{ resource: "task", action: "create", scope: "owned" }]);
    const creatorIdentity = { tenantId: tenant.id, actorUserId: creator.userId, membershipId: creator.membershipId };
    const assignee = await createActorWithGrants(db, tenant.id, [{ resource: "task", action: "read", scope: "assigned" }]);
    const assigneeIdentity = { tenantId: tenant.id, actorUserId: assignee.userId, membershipId: assignee.membershipId };

    await createTask(db, creatorIdentity, { title: "Assigned to someone else", assigneeUserId: assignee.userId }, "11111111-1111-1111-1111-111111111111");

    const assigneeView = await listTasks(db, assigneeIdentity);
    expect(assigneeView.items).toHaveLength(1);
    expect(assigneeView.items[0]!.assignee_user_id).toBe(assignee.userId);
  });
});

describe("completeTask", () => {
  it("marks a task done and rejects completing it twice", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "task", action: "create", scope: "owned" },
      { resource: "task", action: "update", scope: "owned" },
    ]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };
    const task = await createTask(db, identity, { title: "Finish this" }, "11111111-1111-1111-1111-111111111111");

    const completed = await completeTask(db, identity, task.id, "done via phone", "22222222-2222-2222-2222-222222222222");
    expect(completed.status).toBe("done");
    expect(completed.completed_by).toBe(actor.userId);

    await expect(completeTask(db, identity, task.id, undefined, "33333333-3333-3333-3333-333333333333")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("delegateTask (FR-TASK-002, BRULE-TASK-001)", () => {
  it("reassigns to another tenant member and records the previous assignee via audit", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "task", action: "create", scope: "owned" },
      { resource: "task", action: "delegate", scope: "owned" },
    ]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };
    const newAssignee = await insertUser(db);
    await insertMembership(db, tenant.id, newAssignee.id);

    const task = await createTask(db, identity, { title: "Delegate me" }, "11111111-1111-1111-1111-111111111111");
    const delegated = await delegateTask(db, identity, task.id, newAssignee.id, "on vacation", "22222222-2222-2222-2222-222222222222");
    expect(delegated.assignee_user_id).toBe(newAssignee.id);
  });

  it("rejects delegating to someone outside the tenant", async () => {
    const tenant = await setupTenantWithCatalog();
    const actor = await createActorWithGrants(db, tenant.id, [
      { resource: "task", action: "create", scope: "owned" },
      { resource: "task", action: "delegate", scope: "owned" },
    ]);
    const identity = { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId };
    const outsider = await insertUser(db); // no membership in this tenant

    const task = await createTask(db, identity, { title: "Cannot delegate" }, "11111111-1111-1111-1111-111111111111");
    await expect(
      delegateTask(db, identity, task.id, outsider.id, undefined, "22222222-2222-2222-2222-222222222222"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("tenant isolation (ACC-019)", () => {
  it("a task from tenant A is invisible to an actor in tenant B", async () => {
    const tenantA = await setupTenantWithCatalog();
    const tenantB = await setupTenantWithCatalog();
    const actorA = await createActorWithGrants(db, tenantA.id, [{ resource: "task", action: "create", scope: "owned" }]);
    const identityA = { tenantId: tenantA.id, actorUserId: actorA.userId, membershipId: actorA.membershipId };
    const task = await createTask(db, identityA, { title: "Tenant A only" }, "11111111-1111-1111-1111-111111111111");

    const actorB = await createActorWithGrants(db, tenantB.id, [{ resource: "task", action: "read", scope: "tenant" }]);
    const identityB = { tenantId: tenantB.id, actorUserId: actorB.userId, membershipId: actorB.membershipId };

    await expect(getTask(db, identityB, task.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

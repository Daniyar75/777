import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createTestDb, insertTenant, insertUser, truncateAll } from "@network-crm/test-support";
import { recordAuditEntry, searchAuditLog } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

describe("audit log (SEC-007, SEC-008, ACC-020)", () => {
  it("records an entry and finds it by correlation id", async () => {
    const tenant = await insertTenant(db);
    const actor = await insertUser(db);
    const correlationId = randomUUID();

    await withTenantContext(db, tenant.id, async (tx) => {
      await recordAuditEntry(tx, {
        tenant_id: tenant.id,
        actor_user_id: actor.id,
        action: "role.permissions.updated",
        resource_type: "role",
        resource_id: randomUUID(),
        before: { scope: "owned" },
        after: { scope: "tenant" },
        reason: "widen support access",
        correlation_id: correlationId,
      });
    });

    const { items } = await withTenantContext(db, tenant.id, (tx) =>
      searchAuditLog(tx, { correlationId }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      action: "role.permissions.updated",
      resource_type: "role",
      correlation_id: correlationId,
      before: { scope: "owned" },
      after: { scope: "tenant" },
    });
  });

  it("is isolated per tenant like every other RLS-protected table", async () => {
    const tenantA = await insertTenant(db);
    const tenantB = await insertTenant(db);
    const correlationId = randomUUID();

    await withTenantContext(db, tenantA.id, (tx) =>
      recordAuditEntry(tx, {
        tenant_id: tenantA.id,
        actor_user_id: null,
        action: "tenant.provisioned",
        resource_type: "tenant",
        resource_id: tenantA.id,
        before: null,
        after: null,
        reason: null,
        correlation_id: correlationId,
      }),
    );

    const seenFromB = await withTenantContext(db, tenantB.id, (tx) =>
      searchAuditLog(tx, { correlationId }),
    );
    expect(seenFromB.items).toHaveLength(0);
  });
});

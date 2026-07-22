import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withTenantContext } from "@network-crm/database";
import { createActorWithGrants, createTestDb, insertTenant, truncateAll } from "@network-crm/test-support";
import { ensurePermissionCatalog } from "@network-crm/identity-tenant";
import { exportContactsCsv, importContacts, listContacts } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

async function actorWithContactAccess() {
  const tenant = await insertTenant(db);
  await withTenantContext(db, tenant.id, (tx) => ensurePermissionCatalog(tx));
  const actor = await createActorWithGrants(db, tenant.id, [
    { resource: "contact", action: "create", scope: "tenant" },
    { resource: "contact", action: "read", scope: "tenant" },
  ]);
  return { tenant, identity: { tenantId: tenant.id, actorUserId: actor.userId, membershipId: actor.membershipId } };
}

describe("importContacts (BL-203, FR-CORE-006)", () => {
  it("dry_run leaves the database unchanged (ACC-003)", async () => {
    const { identity } = await actorWithContactAccess();

    const result = await importContacts(
      db,
      identity,
      { mode: "dry_run", rows: [{ display_name: "Row One" }, { display_name: "Row Two" }] },
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.outcome === "would_create")).toBe(true);

    const { items } = await listContacts(db, identity);
    expect(items).toHaveLength(0);
  });

  it("commit creates rows and reports partial success alongside failures", async () => {
    const { identity } = await actorWithContactAccess();

    const result = await importContacts(
      db,
      identity,
      {
        mode: "commit",
        rows: [{ display_name: "Valid Row" }, { display_name: "", phone: "123" }],
      },
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.rows[1]!.outcome).toBe("failed");

    const { items } = await listContacts(db, identity);
    expect(items).toHaveLength(1);
    expect(items[0]!.display_name).toBe("Valid Row");
  });

  it("re-running the same commit batch is safe — duplicates are skipped, not re-created (ACC-MVP-005)", async () => {
    const { identity } = await actorWithContactAccess();
    const rows = [{ display_name: "Ivan", phone: "+7 700 111 22 33" }];

    const first = await importContacts(db, identity, { mode: "commit", rows }, "11111111-1111-1111-1111-111111111111");
    expect(first.created).toBe(1);

    const second = await importContacts(db, identity, { mode: "commit", rows }, "22222222-2222-2222-2222-222222222222");
    expect(second.created).toBe(0);
    expect(second.skipped_duplicate).toBe(1);

    const { items } = await listContacts(db, identity);
    expect(items).toHaveLength(1);
  });

  it("on_duplicate=create_anyway bypasses the skip default", async () => {
    const { identity } = await actorWithContactAccess();
    const rows = [{ display_name: "Ivan", phone: "+7 700 111 22 33" }];

    await importContacts(db, identity, { mode: "commit", rows }, "11111111-1111-1111-1111-111111111111");
    const second = await importContacts(
      db,
      identity,
      { mode: "commit", onDuplicate: "create_anyway", rows },
      "22222222-2222-2222-2222-222222222222",
    );
    expect(second.created).toBe(1);

    const { items } = await listContacts(db, identity);
    expect(items).toHaveLength(2);
  });
});

describe("exportContactsCsv (BL-203, FR-CORE-007)", () => {
  it("exports only the fields visible through the same scope as listContacts", async () => {
    const { identity } = await actorWithContactAccess();
    await importContacts(
      db,
      identity,
      { mode: "commit", rows: [{ display_name: "Export Me", email: "export@example.test" }] },
      "11111111-1111-1111-1111-111111111111",
    );

    const csv = await exportContactsCsv(db, identity, "22222222-2222-2222-2222-222222222222");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("display_name,full_name,source,phone,email,external_id,status");
    expect(lines[1]).toContain("Export Me");
    expect(lines[1]).toContain("export@example.test");
  });
});

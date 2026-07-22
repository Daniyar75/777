import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { schema, withTenantContext } from "@network-crm/database";
import { createTestDb, insertTenant, truncateAll } from "@network-crm/test-support";
import { provisionTenant } from "./index.js";

const { db, close } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

describe("provisionTenant (US-PLATFORM-001)", () => {
  it("creates tenant, admin user, company_admin role with grants, membership, audit and outbox event", async () => {
    const result = await provisionTenant(db, {
      name: "Acme Network",
      slug: "acme-network",
      default_locale: "ru",
      timezone: "UTC",
      admin_email: "admin@acme.test",
    });

    expect(result.tenant.slug).toBe("acme-network");
    expect(result.adminUser.loginIdentity).toBe("admin@acme.test");
    expect(result.temporaryPassword).toBeTruthy();

    await withTenantContext(db, result.tenant.id, async (tx) => {
      const [membership] = await tx
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.id, result.membershipId));
      expect(membership?.status).toBe("active");

      const roles = await tx.select().from(schema.roles).where(eq(schema.roles.id, result.roleId));
      expect(roles).toHaveLength(1);
      expect(roles[0]?.code).toBe("company_admin");

      const bindings = await tx.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, result.roleId));
      expect(bindings.length).toBeGreaterThan(0);

      const audit = await tx.select().from(schema.auditLog).where(eq(schema.auditLog.resourceId, result.tenant.id));
      expect(audit.some((a) => a.action === "tenant.provisioned")).toBe(true);

      const outbox = await tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.tenantId, result.tenant.id));
      expect(outbox.some((e) => e.eventType === "PlatformTenantProvisioned")).toBe(true);
    });
  });

  it("rolls back entirely when the slug is already taken (no partial provision)", async () => {
    await insertTenant(db, { slug: "duplicate-slug" });

    await expect(
      provisionTenant(db, {
        name: "Second Co",
        slug: "duplicate-slug",
        default_locale: "ru",
        timezone: "UTC",
        admin_email: "second@example.test",
      }),
    ).rejects.toThrow(/already in use/);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.loginIdentity, "second@example.test"));
    expect(user).toBeUndefined();
  });

  it("reuses an existing user by login_identity instead of creating a duplicate", async () => {
    const first = await provisionTenant(db, {
      name: "First Co",
      slug: "first-co",
      default_locale: "ru",
      timezone: "UTC",
      admin_email: "shared-admin@example.test",
    });

    const second = await provisionTenant(db, {
      name: "Second Co",
      slug: "second-co",
      default_locale: "ru",
      timezone: "UTC",
      admin_email: "shared-admin@example.test",
    });

    expect(second.adminUser.id).toBe(first.adminUser.id);
    expect(second.temporaryPassword).toBeUndefined();

    const allUsers = await db.select().from(schema.users).where(eq(schema.users.loginIdentity, "shared-admin@example.test"));
    expect(allUsers).toHaveLength(1);
  });
});

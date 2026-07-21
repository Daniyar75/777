import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { hashPassword } from "@network-crm/crypto";

export async function insertTenant(
  db: Database,
  overrides: Partial<typeof schema.tenants.$inferInsert> = {},
) {
  const id = overrides.id ?? randomUUID();
  const [row] = await db
    .insert(schema.tenants)
    .values({
      id,
      name: overrides.name ?? `Test Tenant ${id.slice(0, 8)}`,
      slug: overrides.slug ?? `test-${id.slice(0, 8)}`,
      status: overrides.status ?? "active",
      defaultLocale: overrides.defaultLocale ?? "ru",
      timezone: overrides.timezone ?? "UTC",
    })
    .returning();
  return row!;
}

export async function insertUser(
  db: Database,
  overrides: Partial<typeof schema.users.$inferInsert> & { password?: string } = {},
) {
  const id = overrides.id ?? randomUUID();
  const passwordHash = overrides.passwordHash ?? (await hashPassword(overrides.password ?? "Password123!"));
  const [row] = await db
    .insert(schema.users)
    .values({
      id,
      loginIdentity: overrides.loginIdentity ?? `user-${id.slice(0, 8)}@example.test`,
      passwordHash,
      displayName: overrides.displayName ?? "Test User",
      status: overrides.status ?? "active",
      mfaEnabled: overrides.mfaEnabled ?? false,
    })
    .returning();
  return row!;
}

export async function insertMembership(db: Database, tenantId: string, userId: string) {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.memberships)
      .values({ id: randomUUID(), tenantId, userId, status: "active" })
      .returning();
    return row!;
  });
}

export async function insertRole(
  db: Database,
  tenantId: string,
  overrides: Partial<typeof schema.roles.$inferInsert> = {},
) {
  return withTenantContext(db, tenantId, async (tx) => {
    const id = overrides.id ?? randomUUID();
    const [row] = await tx
      .insert(schema.roles)
      .values({
        id,
        tenantId,
        code: overrides.code ?? `role-${id.slice(0, 8)}`,
        name: overrides.name ?? "Test Role",
        scope: overrides.scope ?? "tenant",
        branchDepth: overrides.branchDepth ?? null,
      })
      .returning();
    return row!;
  });
}

export async function insertPermission(db: Database, resource: string, action: string) {
  const [row] = await db
    .insert(schema.permissions)
    .values({ id: randomUUID(), resource, action })
    .onConflictDoNothing({ target: [schema.permissions.resource, schema.permissions.action] })
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(schema.permissions)
    .where(and(eq(schema.permissions.resource, resource), eq(schema.permissions.action, action)));
  return existing!;
}

export async function bindPermission(
  db: Database,
  tenantId: string,
  roleId: string,
  permissionId: string,
  overrides: Partial<typeof schema.rolePermissions.$inferInsert> = {},
) {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.rolePermissions)
      .values({
        id: randomUUID(),
        tenantId,
        roleId,
        permissionId,
        effect: overrides.effect ?? "allow",
        scope: overrides.scope ?? "tenant",
        branchDepth: overrides.branchDepth ?? null,
        allowedFieldSensitivity: overrides.allowedFieldSensitivity ?? [],
      })
      .returning();
    return row!;
  });
}

export async function assignRole(db: Database, tenantId: string, membershipId: string, roleId: string) {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.membershipRoles)
      .values({ id: randomUUID(), tenantId, membershipId, roleId })
      .returning();
    return row!;
  });
}

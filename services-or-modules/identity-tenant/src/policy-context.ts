import { eq } from "drizzle-orm";
import { schema, type Database } from "@network-crm/database";
import type { FieldSensitivity, PolicyContext, RoleBinding } from "@network-crm/authz";

/**
 * Loads the RBAC+ABAC PolicyContext (ADR-0004) for a membership, fresh from the database
 * on every call rather than trusting a cached/JWT-embedded permission list — a role or
 * permission-binding change (FR-ADMIN-002) then takes effect on the very next request,
 * with no stale-token window to reason about.
 */
export async function loadPolicyContext(
  tx: Database,
  tenantId: string,
  actorUserId: string,
  membershipId: string,
): Promise<PolicyContext> {
  const roleRows = await tx
    .select({ roleId: schema.roles.id, roleCode: schema.roles.code })
    .from(schema.membershipRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.membershipRoles.roleId))
    .where(eq(schema.membershipRoles.membershipId, membershipId));

  const roles: RoleBinding[] = [];
  for (const roleRow of roleRows) {
    const bindingRows = await tx
      .select({
        resource: schema.permissions.resource,
        action: schema.permissions.action,
        effect: schema.rolePermissions.effect,
        scope: schema.rolePermissions.scope,
        branchDepth: schema.rolePermissions.branchDepth,
        allowedFieldSensitivity: schema.rolePermissions.allowedFieldSensitivity,
      })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
      .where(eq(schema.rolePermissions.roleId, roleRow.roleId));

    roles.push({
      roleCode: roleRow.roleCode,
      permissions: bindingRows.map((b) => ({
        resource: b.resource,
        action: b.action,
        effect: b.effect,
        scope: b.scope,
        branchDepth: b.branchDepth,
        allowedFieldSensitivity: (b.allowedFieldSensitivity as FieldSensitivity[] | null) ?? [],
      })),
    });
  }

  return { tenantId, actorUserId, roles };
}

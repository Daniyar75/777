import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { evaluate, type PolicyContext, type Scope } from "@network-crm/authz";
import { recordAuditEntry } from "@network-crm/governance";
import type { Role } from "@network-crm/contracts";
import { DomainError } from "./errors.js";
import { findPermissionId } from "./permission-catalog.js";
import { loadPolicyContext } from "./policy-context.js";

const SCOPE_RANK: Record<Scope, number> = {
  self: 0,
  owned: 1,
  assigned: 1,
  mentored: 1,
  branch: 2,
  tenant: 3,
  platform: 4,
};

export interface ActingIdentity {
  tenantId: string;
  actorUserId: string;
  membershipId: string;
}

export async function requireTenantPermission(
  db: Database,
  identity: ActingIdentity,
  resource: string,
  action: string,
): Promise<PolicyContext> {
  const ctx = await withTenantContext(db, identity.tenantId, (tx) =>
    loadPolicyContext(tx, identity.tenantId, identity.actorUserId, identity.membershipId),
  );
  const decision = evaluate(ctx, {
    resource,
    action,
    object: { tenantId: identity.tenantId },
  });
  if (!decision.allowed) {
    throw new DomainError("PERMISSION_DENIED", `Not permitted: ${resource}.${action}`);
  }
  return ctx;
}

function maxGrantedRank(ctx: PolicyContext, resource: string, action: string): number {
  let max = -1;
  for (const role of ctx.roles) {
    for (const binding of role.permissions) {
      if (binding.resource === resource && binding.action === action && binding.effect === "allow") {
        max = Math.max(max, SCOPE_RANK[binding.scope]);
      }
    }
  }
  return max;
}

export async function createRole(
  db: Database,
  identity: ActingIdentity,
  input: { code: string; name: string; scope: Scope; branchDepth?: number | null },
  correlationId: string,
): Promise<Role> {
  await requireTenantPermission(db, identity, "role", "create");

  return withTenantContext(db, identity.tenantId, async (tx) => {
    let row: typeof schema.roles.$inferSelect | undefined;
    try {
      const inserted = await tx
        .insert(schema.roles)
        .values({
          id: randomUUID(),
          tenantId: identity.tenantId,
          code: input.code,
          name: input.name,
          scope: input.scope,
          branchDepth: input.branchDepth ?? null,
        })
        .returning();
      row = inserted[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DomainError("VALIDATION_FAILED", `Role code "${input.code}" already exists`);
      }
      throw err;
    }

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "role.created",
      resource_type: "role",
      resource_id: row!.id,
      before: null,
      after: { code: input.code, name: input.name, scope: input.scope },
      reason: null,
      correlation_id: correlationId,
    });

    return mapRole(row!);
  });
}

export interface BindPermissionInput {
  roleId: string;
  resource: string;
  action: string;
  effect?: "allow" | "deny";
  scope: Scope;
  branchDepth?: number | null;
  allowedFieldSensitivity?: Array<"none" | "pii_standard" | "pii_sensitive">;
}

/**
 * roles-and-permissions.md §4 ("запрещено... расширять собственные permissions"): a deny
 * binding always narrows, so it never needs the check; an allow binding is rejected unless
 * the granting actor already holds an equal-or-broader allow for the same (resource, action).
 */
export async function bindPermission(
  db: Database,
  identity: ActingIdentity,
  input: BindPermissionInput,
  correlationId: string,
): Promise<void> {
  const actorCtx = await requireTenantPermission(db, identity, "role", "permissions.update");

  if (input.effect !== "deny") {
    const actorRank = maxGrantedRank(actorCtx, input.resource, input.action);
    const requestedRank = SCOPE_RANK[input.scope];
    if (actorRank < requestedRank) {
      throw new DomainError(
        "PERMISSION_DENIED",
        `Cannot grant ${input.resource}.${input.action} at scope "${input.scope}": exceeds the granting user's own scope`,
      );
    }
  }

  await withTenantContext(db, identity.tenantId, async (tx) => {
    // roles.tenant_id has an ordinary FK, and Postgres foreign-key checks confirm only that
    // *some* row with this id exists, regardless of RLS — they do not confirm it belongs to
    // the caller's tenant. This explicit, RLS-filtered lookup is what actually enforces that
    // (threat-model.md §2.2 IDOR): a role id from another tenant is invisible under this
    // tenant's context and surfaces as NOT_FOUND, never a silent cross-tenant write.
    const [role] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.id, input.roleId));
    if (!role) {
      throw new DomainError("NOT_FOUND", `Role ${input.roleId} not found in this tenant`);
    }

    const permissionId = await findPermissionId(tx, input.resource, input.action);
    if (!permissionId) {
      throw new DomainError("VALIDATION_FAILED", `Unknown permission ${input.resource}.${input.action}`);
    }

    const inserted = await tx
      .insert(schema.rolePermissions)
      .values({
        id: randomUUID(),
        tenantId: identity.tenantId,
        roleId: input.roleId,
        permissionId,
        effect: input.effect ?? "allow",
        scope: input.scope,
        branchDepth: input.branchDepth ?? null,
        allowedFieldSensitivity: input.allowedFieldSensitivity ?? [],
      })
      .onConflictDoNothing({
        target: [schema.rolePermissions.roleId, schema.rolePermissions.permissionId],
      })
      .returning();

    if (inserted.length === 0) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "This role already has a binding for that permission (update is not supported yet, unbind first)",
      );
    }

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "role.permissions.updated",
      resource_type: "role",
      resource_id: input.roleId,
      before: null,
      after: {
        resource: input.resource,
        action: input.action,
        effect: input.effect ?? "allow",
        scope: input.scope,
      },
      reason: null,
      correlation_id: correlationId,
    });
  });
}

export async function listRoles(db: Database, identity: ActingIdentity): Promise<Role[]> {
  await requireTenantPermission(db, identity, "role", "read");
  return withTenantContext(db, identity.tenantId, async (tx) => {
    const rows = await tx.select().from(schema.roles).where(eq(schema.roles.tenantId, identity.tenantId));
    return rows.map(mapRole);
  });
}

function mapRole(row: typeof schema.roles.$inferSelect): Role {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    code: row.code,
    name: row.name,
    scope: row.scope,
    branch_depth: row.branchDepth,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}

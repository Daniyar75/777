import { withTenantContext, type Database } from "@network-crm/database";
import { evaluate, type FieldSensitivity, type ObjectAttributes, type Scope } from "@network-crm/authz";
import { loadPolicyContext, type ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError } from "@network-crm/contracts";

/**
 * Object-level RBAC+ABAC check (ADR-0004) for a specific resource instance — unlike
 * identity-tenant's requireTenantPermission (tenant-wide admin actions only), this accepts
 * ownership/assignment attributes so "owned"/"assigned"/etc. scopes can be evaluated against
 * a real row. Shared across services-or-modules/* (originally written for relationship-crm,
 * promoted here once work-management needed the identical shape) so every module's object
 * checks go through one implementation instead of copies drifting apart.
 */
export async function requireObjectAccess(
  db: Database,
  identity: ActingIdentity,
  resource: string,
  action: string,
  object: Omit<ObjectAttributes, "tenantId">,
  fieldSensitivity?: FieldSensitivity,
): Promise<void> {
  const ctx = await withTenantContext(db, identity.tenantId, (tx) =>
    loadPolicyContext(tx, identity.tenantId, identity.actorUserId, identity.membershipId),
  );
  const decision = evaluate(ctx, {
    resource,
    action,
    fieldSensitivity,
    object: { tenantId: identity.tenantId, ...object },
  });
  if (!decision.allowed) {
    throw new DomainError("PERMISSION_DENIED", `Not permitted: ${resource}.${action}`);
  }
}

const SCOPE_RANK: Record<Scope, number> = {
  self: 0,
  owned: 1,
  assigned: 1,
  mentored: 1,
  branch: 2,
  tenant: 3,
  platform: 4,
};

/**
 * The actor's broadest granted scope for (resource, action), or null if none. Used to decide
 * a LIST query's filter (e.g. "owned" -> filter by owner_user_id) since a single access-check
 * result can't express a per-row decision the way requireObjectAccess can for one instance.
 */
export async function resolveBestScope(
  db: Database,
  identity: ActingIdentity,
  resource: string,
  action: string,
): Promise<Scope | null> {
  const ctx = await withTenantContext(db, identity.tenantId, (tx) =>
    loadPolicyContext(tx, identity.tenantId, identity.actorUserId, identity.membershipId),
  );
  let best: Scope | null = null;
  let bestRank = -1;
  for (const role of ctx.roles) {
    for (const binding of role.permissions) {
      if (binding.resource === resource && binding.action === action && binding.effect === "allow") {
        if (SCOPE_RANK[binding.scope] > bestRank) {
          bestRank = SCOPE_RANK[binding.scope];
          best = binding.scope;
        }
      }
    }
  }
  return best;
}

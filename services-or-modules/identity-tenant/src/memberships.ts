import { eq } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import type { MembershipSummary } from "@network-crm/contracts";
import type { ActingIdentity } from "./roles.js";
import { requireTenantPermission } from "./roles.js";

/**
 * Lightweight membership+user listing for pickers (e.g. work-management's task-delegation
 * assignee list, FR-TASK-002) — anything that needs "who else is in this tenant" without the
 * full role/permission detail `loadPolicyContext` carries.
 */
export async function listMemberships(db: Database, identity: ActingIdentity): Promise<MembershipSummary[]> {
  await requireTenantPermission(db, identity, "membership", "read");

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const rows = await tx
      .select({
        membershipId: schema.memberships.id,
        userId: schema.users.id,
        loginIdentity: schema.users.loginIdentity,
        displayName: schema.users.displayName,
        status: schema.memberships.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.tenantId, identity.tenantId));

    return rows.map((r) => ({
      membership_id: r.membershipId,
      user_id: r.userId,
      login_identity: r.loginIdentity,
      display_name: r.displayName,
      status: r.status,
    }));
  });
}

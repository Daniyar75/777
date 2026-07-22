import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, setTenantContext, type Database } from "@network-crm/database";
import { hashPassword, randomToken } from "@network-crm/crypto";
import { makeEnvelope, publish } from "@network-crm/eventing";
import { recordAuditEntry } from "@network-crm/governance";
import type { ProvisionTenantRequest, Tenant } from "@network-crm/contracts";
import { DomainError } from "./errors.js";
import { mapTenant } from "./mappers.js";
import { COMPANY_ADMIN_GRANTS, ensurePermissionCatalog } from "./permission-catalog.js";

export interface ProvisionTenantResult {
  tenant: Tenant;
  adminUser: { id: string; loginIdentity: string };
  membershipId: string;
  roleId: string;
  /** Set only when a new admin user was created; the invite-email delivery itself is out of
   * scope for Stage 1 (BL-101) — this is the bootstrap credential a real invite flow would
   * carry, returned once so the caller (apps/api) can hand it to an out-of-band invite step. */
  temporaryPassword?: string;
}

/**
 * US-PLATFORM-001: "задать профиль → provision → пригласить admin", with rollback on
 * incomplete provision. Implemented as a single database transaction so partial failure
 * is impossible by construction — there is no manual compensating-rollback path to get
 * wrong (ACC-MVP-001 spirit: no state that only a manual DB fix can repair).
 */
export async function provisionTenant(
  db: Database,
  input: ProvisionTenantRequest,
): Promise<ProvisionTenantResult> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    const tenantId = randomUUID();

    let tenantRow: typeof schema.tenants.$inferSelect;
    try {
      const [row] = await tx
        .insert(schema.tenants)
        .values({
          id: tenantId,
          name: input.name,
          slug: input.slug,
          status: "trial",
          defaultLocale: input.default_locale,
          timezone: input.timezone,
        })
        .returning();
      tenantRow = row!;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DomainError("VALIDATION_FAILED", `Tenant slug "${input.slug}" is already in use`);
      }
      throw err;
    }

    // Every subsequent write in this transaction is tenant-scoped and RLS-protected;
    // setting the GUC here (rather than via withTenantContext) lets us keep the global
    // tenants-table insert above and the tenant-scoped inserts below in one atomic tx.
    await setTenantContext(tx, tenantId);

    let adminUser = (
      await tx.select().from(schema.users).where(eq(schema.users.loginIdentity, input.admin_email))
    )[0];
    let temporaryPassword: string | undefined;
    if (!adminUser) {
      temporaryPassword = randomToken(9);
      const passwordHash = await hashPassword(temporaryPassword);
      const [row] = await tx
        .insert(schema.users)
        .values({
          id: randomUUID(),
          loginIdentity: input.admin_email,
          passwordHash,
          displayName: input.admin_email,
          status: "active",
          mfaEnabled: false,
        })
        .returning();
      adminUser = row!;
    }

    const permissionIds = await ensurePermissionCatalog(tx);

    const roleId = randomUUID();
    await tx.insert(schema.roles).values({
      id: roleId,
      tenantId,
      code: "company_admin",
      name: "Company Admin",
      scope: "tenant",
      branchDepth: null,
    });

    for (const grant of COMPANY_ADMIN_GRANTS) {
      const permissionId = permissionIds.get(`${grant.resource}:${grant.action}`);
      if (!permissionId) {
        throw new Error(`Permission catalog missing ${grant.resource}:${grant.action}`);
      }
      await tx.insert(schema.rolePermissions).values({
        id: randomUUID(),
        tenantId,
        roleId,
        permissionId,
        effect: "allow",
        scope: "tenant",
        branchDepth: null,
        allowedFieldSensitivity: ["none", "pii_standard", "pii_sensitive"],
      });
    }

    const membershipId = randomUUID();
    await tx.insert(schema.memberships).values({ id: membershipId, tenantId, userId: adminUser.id, status: "active" });
    await tx.insert(schema.membershipRoles).values({ id: randomUUID(), tenantId, membershipId, roleId });

    const correlationId = randomUUID();
    await recordAuditEntry(tx, {
      tenant_id: tenantId,
      actor_user_id: null,
      action: "tenant.provisioned",
      resource_type: "tenant",
      resource_id: tenantId,
      before: null,
      after: { slug: input.slug, admin_email: input.admin_email },
      reason: null,
      correlation_id: correlationId,
    });

    // Platform lifecycle event, not one of the 20 domain events in event-catalog.md —
    // still published via the same outbox mechanism (ADR-0005) for operational consumers
    // (e.g. provisioning dashboards), documented here rather than silently added to the catalog.
    await publish(
      tx,
      makeEnvelope({
        eventType: "PlatformTenantProvisioned",
        tenantId,
        aggregateType: "Tenant",
        aggregateId: tenantId,
        aggregateVersion: 0,
        correlationId,
        producer: "identity-tenant",
        payload: { tenant_id: tenantId, slug: input.slug },
      }),
    );

    return {
      tenant: mapTenant(tenantRow),
      adminUser: { id: adminUser.id, loginIdentity: adminUser.loginIdentity },
      membershipId,
      roleId,
      temporaryPassword,
    };
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}

import type { FastifyInstance } from "fastify";
import { ProvisionTenantRequest } from "@network-crm/contracts";
import { listMemberships, provisionTenant, type TokenService } from "@network-crm/identity-tenant";
import type { Database } from "@network-crm/database";
import { ApiHttpError } from "../errors.js";
import { requireIdentity, requireTenantIdentity } from "../auth-context.js";

/**
 * Bootstrap-only endpoint (API-002 `/tenants`). Real platform-owner authentication/RBAC for
 * this route is intentionally deferred — Stage 1 gates it with a shared provisioning key
 * instead of building out a full platform-owner identity flow, which is out of scope until
 * a second platform-level actor exists. This MUST be replaced before any non-pilot rollout
 * (docs/architecture/adr/0003-authentication.md does not yet cover platform-owner auth).
 */
export function registerTenantRoutes(
  app: FastifyInstance,
  deps: { db: Database; provisioningKey: string; tokenService: TokenService },
) {
  app.post("/tenants", async (request, reply) => {
    const providedKey = request.headers["x-platform-provisioning-key"];
    if (providedKey !== deps.provisioningKey) {
      throw new ApiHttpError("PERMISSION_DENIED", "Missing or invalid platform provisioning key");
    }
    const input = ProvisionTenantRequest.parse(request.body);
    const result = await provisionTenant(deps.db, input);
    reply.code(201);
    return {
      tenant: result.tenant,
      admin_user: result.adminUser,
      membership_id: result.membershipId,
      // Returned once, in place of a real invite-email delivery (Stage 1 stub, see provisionTenant).
      temporary_password: result.temporaryPassword,
    };
  });

  // API-002 `/memberships` — powers pickers like task delegation (FR-TASK-002).
  app.get("/memberships", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const items = await listMemberships(deps.db, identity);
    return { items, next_cursor: null };
  });
}

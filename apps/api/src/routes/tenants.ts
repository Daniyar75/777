import type { FastifyInstance } from "fastify";
import { ProvisionTenantRequest } from "@network-crm/contracts";
import { provisionTenant } from "@network-crm/identity-tenant";
import type { Database } from "@network-crm/database";
import { ApiHttpError } from "../errors.js";

/**
 * Bootstrap-only endpoint (API-002 `/tenants`). Real platform-owner authentication/RBAC for
 * this route is intentionally deferred — Stage 1 gates it with a shared provisioning key
 * instead of building out a full platform-owner identity flow, which is out of scope until
 * a second platform-level actor exists. This MUST be replaced before any non-pilot rollout
 * (docs/architecture/adr/0003-authentication.md does not yet cover platform-owner auth).
 */
export function registerTenantRoutes(app: FastifyInstance, deps: { db: Database; provisioningKey: string }) {
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
}

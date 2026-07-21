import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext, type Database } from "@network-crm/database";
import { searchAuditLog } from "@network-crm/governance";
import { requireTenantPermission, type TokenService } from "@network-crm/identity-tenant";
import { requireIdentity, requireTenantIdentity } from "../auth-context.js";

const AuditQuery = z.object({
  correlation_id: z.string().uuid().optional(),
  resource_type: z.string().optional(),
  resource_id: z.string().uuid().optional(),
  actor_user_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export function registerAuditRoutes(app: FastifyInstance, deps: { db: Database; tokenService: TokenService }) {
  app.get("/audit", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    await requireTenantPermission(deps.db, identity, "audit", "read");

    const query = AuditQuery.parse(request.query);
    const { items, nextCursor } = await withTenantContext(deps.db, identity.tenantId, (tx) =>
      searchAuditLog(tx, {
        correlationId: query.correlation_id,
        resourceType: query.resource_type,
        resourceId: query.resource_id,
        actorUserId: query.actor_user_id,
        cursor: query.cursor,
        pageSize: query.page_size,
      }),
    );
    return { items, next_cursor: nextCursor };
  });
}

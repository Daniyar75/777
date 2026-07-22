import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Role } from "@network-crm/contracts";
import { bindPermission, createRole, listRoles, type TokenService } from "@network-crm/identity-tenant";
import type { Database } from "@network-crm/database";
import { requireIdentity, requireTenantIdentity } from "../auth-context.js";

const Scope = z.enum(["self", "owned", "assigned", "mentored", "branch", "tenant", "platform"]);

const CreateRoleBody = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  scope: Scope,
  branch_depth: z.number().int().nonnegative().nullable().optional(),
});

const BindPermissionBody = z.object({
  resource: z.string().min(1),
  action: z.string().min(1),
  effect: z.enum(["allow", "deny"]).optional(),
  scope: Scope,
  branch_depth: z.number().int().nonnegative().nullable().optional(),
  allowed_field_sensitivity: z.array(z.enum(["none", "pii_standard", "pii_sensitive"])).optional(),
});

export function registerRoleRoutes(app: FastifyInstance, deps: { db: Database; tokenService: TokenService }) {
  app.post("/roles", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const input = CreateRoleBody.parse(request.body);
    const role = await createRole(
      deps.db,
      identity,
      { code: input.code, name: input.name, scope: input.scope, branchDepth: input.branch_depth ?? null },
      randomUUID(),
    );
    reply.code(201);
    return Role.parse(role);
  });

  app.get("/roles", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const roles = await listRoles(deps.db, identity);
    return { items: roles, next_cursor: null };
  });

  app.put("/roles/:id/permissions", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = BindPermissionBody.parse(request.body);
    await bindPermission(
      deps.db,
      identity,
      {
        roleId: id,
        resource: input.resource,
        action: input.action,
        effect: input.effect,
        scope: input.scope,
        branchDepth: input.branch_depth ?? null,
        allowedFieldSensitivity: input.allowed_field_sensitivity,
      },
      randomUUID(),
    );
    reply.code(200);
    return { status: "ok" };
  });
}

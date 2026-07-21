import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashToken } from "@network-crm/crypto";
import { LoginRequest, MfaVerifyRequest, RefreshRequest, SwitchTenantRequest } from "@network-crm/contracts";
import {
  listSessions,
  login,
  refreshSession,
  revokeSession,
  switchTenant,
  verifyMfa,
  type TokenService,
} from "@network-crm/identity-tenant";
import type { Database } from "@network-crm/database";
import { requireIdentity } from "../auth-context.js";

export function registerAuthRoutes(app: FastifyInstance, deps: { db: Database; tokenService: TokenService }) {
  app.post("/auth/login", async (request) => {
    const input = LoginRequest.parse(request.body);
    return login(deps.db, deps.tokenService, input, {
      userAgent: request.headers["user-agent"] ?? null,
      ipHash: hashIp(request.ip),
    });
  });

  app.post("/auth/mfa/verify", async (request) => {
    const input = MfaVerifyRequest.parse(request.body);
    return verifyMfa(deps.db, deps.tokenService, input, {
      userAgent: request.headers["user-agent"] ?? null,
      ipHash: hashIp(request.ip),
    });
  });

  // Stage-1 pragmatic path: docs/api/openapi-skeleton.yaml's illustrative
  // /memberships/{id}/switch is reconciled with real code once the membership-id-first
  // flow is implemented; for now the caller supplies tenant_id directly (SwitchTenantRequest).
  app.post("/auth/switch-tenant", async (request) => {
    const identity = await requireIdentity(request.headers.authorization, deps.tokenService);
    const input = SwitchTenantRequest.parse(request.body);
    return switchTenant(deps.db, deps.tokenService, {
      userId: identity.userId,
      tenantId: input.tenant_id,
      mfaVerified: identity.mfaVerified,
      meta: { userAgent: request.headers["user-agent"] ?? null, ipHash: hashIp(request.ip) },
    });
  });

  app.post("/sessions/refresh", async (request) => {
    const input = RefreshRequest.parse(request.body);
    return refreshSession(deps.db, deps.tokenService, input.refresh_token);
  });

  app.get("/sessions", async (request) => {
    const identity = await requireIdentity(request.headers.authorization, deps.tokenService);
    return { items: await listSessions(deps.db, identity.userId, identity.sessionId), next_cursor: null };
  });

  app.delete("/sessions/:id", async (request, reply) => {
    const identity = await requireIdentity(request.headers.authorization, deps.tokenService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await revokeSession(deps.db, id, identity.userId);
    reply.code(204);
  });
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  // Not stored in plaintext (SEC-015). A per-deployment pepper should be mixed in before
  // production use (docs/architecture/adr/0003-authentication.md does not yet fix one) —
  // a bare sha256 of the IP is a placeholder, not a final policy.
  return hashToken(ip);
}

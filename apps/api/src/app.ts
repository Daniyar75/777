import Fastify, { type FastifyInstance } from "fastify";
import type { Database } from "@network-crm/database";
import { createTokenService, type TokenService } from "@network-crm/identity-tenant";
import { toErrorBody } from "./errors.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerContactRoutes } from "./routes/contacts.js";
import { registerRoleRoutes } from "./routes/roles.js";
import { registerTenantRoutes } from "./routes/tenants.js";

export interface BuildAppOptions {
  db: Database;
  jwtSecret: string;
  provisioningKey: string;
  tokenService?: TokenService; // injectable for tests
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const tokenService = options.tokenService ?? createTokenService(options.jwtSecret);

  app.setErrorHandler((err, request, reply) => {
    const { status, body } = toErrorBody(err);
    if (status >= 500) {
      request.log.error({ err, correlation_id: body.correlation_id }, "unhandled error");
    }
    reply.code(status).send(body);
  });

  registerTenantRoutes(app, { db: options.db, provisioningKey: options.provisioningKey });
  registerAuthRoutes(app, { db: options.db, tokenService });
  registerRoleRoutes(app, { db: options.db, tokenService });
  registerAuditRoutes(app, { db: options.db, tokenService });
  registerContactRoutes(app, { db: options.db, tokenService });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

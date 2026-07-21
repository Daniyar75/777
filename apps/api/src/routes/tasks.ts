import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CompleteTaskRequest, CreateTaskRequest, DelegateTaskRequest, Task } from "@network-crm/contracts";
import { completeTask, createTask, delegateTask, getTask, listTasks } from "@network-crm/work-management";
import type { TokenService } from "@network-crm/identity-tenant";
import type { Database } from "@network-crm/database";
import { requireIdentity, requireTenantIdentity } from "../auth-context.js";

const IdParam = z.object({ id: z.string().uuid() });

export function registerTaskRoutes(app: FastifyInstance, deps: { db: Database; tokenService: TokenService }) {
  app.post("/tasks", async (request, reply) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const input = CreateTaskRequest.parse(request.body);
    const task = await createTask(
      deps.db,
      identity,
      {
        type: input.type,
        subjectType: input.subject_type,
        subjectId: input.subject_id,
        title: input.title,
        assigneeUserId: input.assignee_user_id,
        dueAt: input.due_at,
        priority: input.priority,
      },
      randomUUID(),
    );
    reply.code(201);
    return Task.parse(task);
  });

  app.get("/tasks", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const result = await listTasks(deps.db, identity);
    return { items: result.items, next_cursor: result.nextCursor };
  });

  app.get("/tasks/:id", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    return Task.parse(await getTask(deps.db, identity, id));
  });

  app.post("/tasks/:id/complete", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    const input = CompleteTaskRequest.parse(request.body ?? {});
    return Task.parse(await completeTask(deps.db, identity, id, input.completion_evidence, randomUUID()));
  });

  app.post("/tasks/:id/delegate", async (request) => {
    const identity = requireTenantIdentity(await requireIdentity(request.headers.authorization, deps.tokenService));
    const { id } = IdParam.parse(request.params);
    const input = DelegateTaskRequest.parse(request.body);
    return Task.parse(await delegateTask(deps.db, identity, id, input.assignee_user_id, input.reason, randomUUID()));
  });
}

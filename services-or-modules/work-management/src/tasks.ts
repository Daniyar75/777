import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { schema, withTenantContext, type Database } from "@network-crm/database";
import { requireObjectAccess, resolveBestScope } from "@network-crm/access";
import { recordAuditEntry } from "@network-crm/governance";
import type { ActingIdentity } from "@network-crm/identity-tenant";
import { DomainError, type Task, type TaskPriority } from "@network-crm/contracts";
import { mapTask } from "./mappers.js";

export interface CreateTaskInput {
  type?: string;
  subjectType?: string;
  subjectId?: string;
  title: string;
  assigneeUserId?: string;
  dueAt?: string;
  priority?: TaskPriority;
}

/** FR-TASK-001: Task with type, subject reference, owner, assignee, due date, priority. */
export async function createTask(
  db: Database,
  identity: ActingIdentity,
  input: CreateTaskInput,
  correlationId: string,
): Promise<Task> {
  const assigneeUserId = input.assigneeUserId ?? identity.actorUserId;
  await requireObjectAccess(db, identity, "task", "create", {
    ownerUserId: identity.actorUserId,
    assigneeUserId,
  });

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const id = randomUUID();
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        id,
        tenantId: identity.tenantId,
        type: input.type ?? "general",
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        title: input.title,
        ownerUserId: identity.actorUserId,
        assigneeUserId,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        priority: input.priority ?? "normal",
        status: "open",
        createdBy: identity.actorUserId,
      })
      .returning();

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "task.created",
      resource_type: "task",
      resource_id: id,
      before: null,
      after: { title: input.title, assignee_user_id: assigneeUserId },
      reason: null,
      correlation_id: correlationId,
    });

    return mapTask(row!);
  });
}

async function fetchTask(db: Database, tenantId: string, taskId: string) {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    return row;
  });
}

export async function getTask(db: Database, identity: ActingIdentity, taskId: string): Promise<Task> {
  const task = await fetchTask(db, identity.tenantId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", `Task ${taskId} not found`);
  await requireObjectAccess(db, identity, "task", "read", {
    ownerUserId: task.ownerUserId,
    assigneeUserId: task.assigneeUserId,
  });
  return mapTask(task);
}

export interface ListTasksResult {
  items: Task[];
  nextCursor: string | null;
}

/**
 * Scoping mirrors relationship-crm's listContacts (roles-and-permissions.md §2): tenant/
 * platform scope sees every task; owned or assigned scope sees tasks the actor owns OR is
 * assigned (a Task naturally has two "mine" relationships, unlike Contact's single owner);
 * narrower scopes resolve to nothing visible rather than guessing (deny-by-default).
 */
export async function listTasks(
  db: Database,
  identity: ActingIdentity,
  options: { pageSize?: number } = {},
): Promise<ListTasksResult> {
  const scope = await resolveBestScope(db, identity, "task", "read");
  if (!scope) {
    throw new DomainError("PERMISSION_DENIED", "Not permitted: task.read");
  }
  const pageSize = Math.min(options.pageSize ?? 50, 200);

  return withTenantContext(db, identity.tenantId, async (tx) => {
    if (scope !== "tenant" && scope !== "platform" && scope !== "owned" && scope !== "assigned") {
      return { items: [], nextCursor: null };
    }
    const mineFilter =
      scope === "owned" || scope === "assigned"
        ? or(eq(schema.tasks.ownerUserId, identity.actorUserId), eq(schema.tasks.assigneeUserId, identity.actorUserId))
        : undefined;
    const rows = await tx
      .select()
      .from(schema.tasks)
      .where(mineFilter)
      .orderBy(schema.tasks.createdAt)
      .limit(pageSize + 1);
    const page = rows.slice(0, pageSize);
    return {
      items: page.map(mapTask),
      nextCursor: rows.length > pageSize ? page[page.length - 1]!.id : null,
    };
  });
}

export async function completeTask(
  db: Database,
  identity: ActingIdentity,
  taskId: string,
  completionEvidence: string | undefined,
  correlationId: string,
): Promise<Task> {
  const task = await fetchTask(db, identity.tenantId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", `Task ${taskId} not found`);
  await requireObjectAccess(db, identity, "task", "update", {
    ownerUserId: task.ownerUserId,
    assigneeUserId: task.assigneeUserId,
  });
  if (task.status === "done" || task.status === "cancelled") {
    throw new DomainError("VALIDATION_FAILED", `Task is already ${task.status}`);
  }

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx
      .update(schema.tasks)
      .set({
        status: "done",
        completedAt: new Date(),
        completedBy: identity.actorUserId,
        completionEvidence: completionEvidence ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, taskId))
      .returning();

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "task.completed",
      resource_type: "task",
      resource_id: taskId,
      before: { status: task.status },
      after: { status: "done" },
      reason: null,
      correlation_id: correlationId,
    });

    return mapTask(row!);
  });
}

/**
 * FR-TASK-002/BRULE-TASK-001: delegation preserves author and previous assignee (via audit
 * before/after) and checks the new assignee is in scope. "In scope" is interpreted here as
 * "an active member of this tenant" — the checkable form of that rule until a fuller
 * team/reporting-line model exists to scope delegation more tightly.
 */
export async function delegateTask(
  db: Database,
  identity: ActingIdentity,
  taskId: string,
  newAssigneeUserId: string,
  reason: string | undefined,
  correlationId: string,
): Promise<Task> {
  const task = await fetchTask(db, identity.tenantId, taskId);
  if (!task) throw new DomainError("NOT_FOUND", `Task ${taskId} not found`);
  await requireObjectAccess(db, identity, "task", "delegate", {
    ownerUserId: task.ownerUserId,
    assigneeUserId: task.assigneeUserId,
  });

  const newAssigneeInTenant = await withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx.select({ id: schema.memberships.id }).from(schema.memberships).where(
      and(eq(schema.memberships.userId, newAssigneeUserId), eq(schema.memberships.status, "active")),
    );
    return row;
  });
  if (!newAssigneeInTenant) {
    throw new DomainError("VALIDATION_FAILED", "New assignee is not an active member of this tenant");
  }

  return withTenantContext(db, identity.tenantId, async (tx) => {
    const [row] = await tx
      .update(schema.tasks)
      .set({ assigneeUserId: newAssigneeUserId, updatedAt: new Date() })
      .where(eq(schema.tasks.id, taskId))
      .returning();

    await recordAuditEntry(tx, {
      tenant_id: identity.tenantId,
      actor_user_id: identity.actorUserId,
      action: "task.delegated",
      resource_type: "task",
      resource_id: taskId,
      before: { assignee_user_id: task.assigneeUserId },
      after: { assignee_user_id: newAssigneeUserId },
      reason: reason ?? null,
      correlation_id: correlationId,
    });

    return mapTask(row!);
  });
}

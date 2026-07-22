import type { schema } from "@network-crm/database";
import type { Task } from "@network-crm/contracts";

export function mapTask(row: typeof schema.tasks.$inferSelect): Task {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    type: row.type,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    title: row.title,
    owner_user_id: row.ownerUserId,
    assignee_user_id: row.assigneeUserId,
    due_at: row.dueAt ? row.dueAt.toISOString() : null,
    priority: row.priority,
    status: row.status,
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
    completed_by: row.completedBy,
    completion_evidence: row.completionEvidence,
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy,
    updated_at: row.updatedAt.toISOString(),
    version: row.version,
  };
}

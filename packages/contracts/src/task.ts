import { z } from "zod";
import { systemFields } from "./common.js";

/** ENT-018 Task (FR-TASK-001..003). */
export const TaskPriority = z.enum(["low", "normal", "high", "urgent"]);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const TaskStatus = z.enum(["open", "in_progress", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Task = z.object({
  id: systemFields.id,
  tenant_id: systemFields.tenant_id,
  type: z.string().min(1).max(100),
  subject_type: z.string().max(100).nullable(),
  subject_id: z.string().uuid().nullable(),
  title: z.string().min(1).max(300),
  owner_user_id: z.string().uuid(),
  assignee_user_id: z.string().uuid(),
  due_at: z.string().datetime().nullable(),
  priority: TaskPriority,
  status: TaskStatus,
  completed_at: z.string().datetime().nullable(),
  completed_by: z.string().uuid().nullable(),
  completion_evidence: z.string().nullable(),
  created_at: systemFields.created_at,
  created_by: systemFields.created_by,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
});
export type Task = z.infer<typeof Task>;

export const CreateTaskRequest = z.object({
  type: z.string().min(1).max(100).optional(),
  subject_type: z.string().max(100).optional(),
  subject_id: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  assignee_user_id: z.string().uuid().optional(),
  due_at: z.string().datetime().optional(),
  priority: TaskPriority.optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequest>;

export const CompleteTaskRequest = z.object({
  completion_evidence: z.string().max(2000).optional(),
});
export type CompleteTaskRequest = z.infer<typeof CompleteTaskRequest>;

export const DelegateTaskRequest = z.object({
  assignee_user_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type DelegateTaskRequest = z.infer<typeof DelegateTaskRequest>;

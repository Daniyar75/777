import { z } from "zod";

/** ENT-050 AuditLog — append-only, immutable (SEC-007, SEC-008). Never updated or deleted by ordinary CRUD. */
export const AuditLogEntry = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  actor_user_id: z.string().uuid().nullable(), // null for system/automation actors
  action: z.string().min(1).max(150), // e.g. "role.permissions.updated", "network.relation.created"
  resource_type: z.string().min(1).max(100),
  resource_id: z.string().uuid(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
  correlation_id: z.string().uuid(),
  occurred_at: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

export const RecordAuditEntryInput = AuditLogEntry.omit({ id: true, occurred_at: true });
export type RecordAuditEntryInput = z.infer<typeof RecordAuditEntryInput>;

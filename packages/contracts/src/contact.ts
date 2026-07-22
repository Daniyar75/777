import { z } from "zod";
import { systemFields } from "./common.js";

/** ENT-006 Contact — the identity aggregate (BR-001, domain-model.md §3). */
export const ContactStatus = z.enum(["active", "archived"]);
export type ContactStatus = z.infer<typeof ContactStatus>;

export const Contact = z.object({
  id: systemFields.id,
  tenant_id: systemFields.tenant_id,
  owner_user_id: z.string().uuid(),
  display_name: z.string().min(1).max(200),
  full_name: z.string().max(300).nullable(),
  source: z.string().max(100).nullable(),
  normalized_phone: z.string().nullable(),
  normalized_email: z.string().nullable(),
  external_id: z.string().nullable(),
  status: ContactStatus,
  created_at: systemFields.created_at,
  created_by: systemFields.created_by,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
  archived_at: z.string().datetime().nullable(),
  /** Set when this contact lost a merge; points at the surviving record (BR-024/FR-CONTACT-005). */
  merged_into_id: z.string().uuid().nullable(),
});
export type Contact = z.infer<typeof Contact>;

export const CreateContactRequest = z.object({
  display_name: z.string().min(1).max(200),
  full_name: z.string().max(300).optional(),
  source: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  external_id: z.string().max(200).optional(),
  /** Explicit override after the caller has reviewed duplicate candidates (ACC-001). */
  confirm_despite_duplicates: z.boolean().optional(),
});
export type CreateContactRequest = z.infer<typeof CreateContactRequest>;

export const DuplicateCandidate = z.object({
  contact_id: z.string().uuid(),
  display_name: z.string(),
  matched_on: z.array(z.enum(["phone", "email", "external_id"])),
});
export type DuplicateCandidate = z.infer<typeof DuplicateCandidate>;

// ---- BL-206: merge (FR-CONTACT-005) ----

/** Caller picks which surviving-record values to keep; omitted fields keep the survivor's own value. */
export const MergeContactsRequest = z.object({
  duplicate_contact_id: z.string().uuid(),
  field_resolutions: z
    .object({
      display_name: z.string().min(1).max(200).optional(),
      full_name: z.string().max(300).nullable().optional(),
      source: z.string().max(100).nullable().optional(),
      external_id: z.string().max(200).nullable().optional(),
    })
    .optional(),
});
export type MergeContactsRequest = z.infer<typeof MergeContactsRequest>;

// ---- BL-203: import (FR-CORE-006) / export (FR-CORE-007) ----

export const ImportContactRow = z.object({
  display_name: z.string().min(1).max(200),
  full_name: z.string().max(300).optional(),
  source: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  external_id: z.string().max(200).optional(),
});
export type ImportContactRow = z.infer<typeof ImportContactRow>;

export const ImportContactsRequest = z.object({
  mode: z.enum(["dry_run", "commit"]),
  /** Default "skip": a row matching an existing contact is left alone (safe re-run, ACC-006 pattern). */
  on_duplicate: z.enum(["skip", "create_anyway"]).optional(),
  rows: z.array(ImportContactRow).min(1).max(1000),
});
export type ImportContactsRequest = z.infer<typeof ImportContactsRequest>;

export const ImportRowOutcome = z.enum(["would_create", "created", "skipped_duplicate", "failed"]);
export type ImportRowOutcome = z.infer<typeof ImportRowOutcome>;

export const ImportRowResult = z.object({
  row_index: z.number().int().nonnegative(),
  outcome: ImportRowOutcome,
  contact_id: z.string().uuid().optional(),
  error: z.string().optional(),
});
export type ImportRowResult = z.infer<typeof ImportRowResult>;

export const ImportContactsResult = z.object({
  mode: z.enum(["dry_run", "commit"]),
  total: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  skipped_duplicate: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  rows: z.array(ImportRowResult),
});
export type ImportContactsResult = z.infer<typeof ImportContactsResult>;

/** ENT-007 ContactRole — Contact may hold several simultaneously (BR-001, BRULE-CONTACT-001). */
export const ContactRoleType = z.enum(["candidate", "client", "partner", "other"]);
export type ContactRoleType = z.infer<typeof ContactRoleType>;

export const ContactRole = z.object({
  id: z.string().uuid(),
  tenant_id: systemFields.tenant_id,
  contact_id: z.string().uuid(),
  role_type: ContactRoleType,
  status: z.enum(["active", "inactive"]),
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime().nullable(),
  created_at: systemFields.created_at,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
});
export type ContactRole = z.infer<typeof ContactRole>;

export const AddContactRoleRequest = z.object({
  role_type: ContactRoleType,
});
export type AddContactRoleRequest = z.infer<typeof AddContactRoleRequest>;

/** ENT-048 Consent — purpose+channel scoped, evidence retained (SEC-011). */
export const ConsentStatus = z.enum(["granted", "withdrawn", "expired"]);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

export const Consent = z.object({
  id: z.string().uuid(),
  tenant_id: systemFields.tenant_id,
  contact_id: z.string().uuid(),
  purpose: z.string().min(1).max(100),
  channel: z.string().min(1).max(50),
  status: ConsentStatus,
  captured_at: z.string().datetime(),
  effective_at: z.string().datetime(),
  evidence: z.record(z.string(), z.unknown()).nullable(),
  created_at: systemFields.created_at,
  created_by: systemFields.created_by,
});
export type Consent = z.infer<typeof Consent>;

export const RecordConsentRequest = z.object({
  purpose: z.string().min(1).max(100),
  channel: z.string().min(1).max(50),
  status: ConsentStatus,
  evidence: z.record(z.string(), z.unknown()).optional(),
});
export type RecordConsentRequest = z.infer<typeof RecordConsentRequest>;

/** ENT-016 Activity — immutable fact feeding the unified Contact timeline (FR-CONTACT-003). */
export const Activity = z.object({
  id: z.string().uuid(),
  tenant_id: systemFields.tenant_id,
  contact_id: z.string().uuid(),
  actor_user_id: z.string().uuid().nullable(),
  type: z.string().min(1).max(100),
  summary: z.string().max(2000).nullable(),
  occurred_at: z.string().datetime(),
  source: z.string().max(100),
  correlation_id: z.string().uuid(),
  created_at: systemFields.created_at,
});
export type Activity = z.infer<typeof Activity>;

export const LogActivityRequest = z.object({
  type: z.string().min(1).max(100),
  summary: z.string().max(2000).optional(),
  occurred_at: z.string().datetime().optional(),
});
export type LogActivityRequest = z.infer<typeof LogActivityRequest>;

/** Unified, chronological view merging activities/consent changes/role changes (FR-CONTACT-003). */
export const TimelineEntry = z.object({
  kind: z.enum(["activity", "consent", "role"]),
  occurred_at: z.string().datetime(),
  summary: z.string(),
  ref_id: z.string().uuid(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

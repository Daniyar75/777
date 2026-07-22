import { z } from "zod";
import { systemFields } from "./common.js";

/** ENT-003 User — an account identity, independent of any tenant (QST-017: one User, many tenant memberships). */
export const UserStatus = z.enum(["active", "suspended", "deactivated"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const User = z.object({
  id: systemFields.id,
  login_identity: z.string().email(),
  display_name: z.string().min(1).max(200),
  status: UserStatus,
  mfa_enabled: z.boolean(),
  created_at: systemFields.created_at,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
});
export type User = z.infer<typeof User>;

/** ENT-004 Role — tenant-scoped, versioned via role config, not schema (handoff §5). */
export const Role = z.object({
  id: systemFields.id,
  tenant_id: systemFields.tenant_id,
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  scope: z.enum(["self", "owned", "assigned", "mentored", "branch", "tenant", "platform"]),
  branch_depth: z.number().int().nonnegative().nullable(),
  created_at: systemFields.created_at,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
});
export type Role = z.infer<typeof Role>;

/** ENT-005 Permission — resource/action tuple, unique, assignable to a Role (roles-and-permissions.md §1). */
export const Permission = z.object({
  id: systemFields.id,
  resource: z.string().min(1).max(100),
  action: z.string().min(1).max(100),
  field_sensitivity: z.enum(["none", "pii_standard", "pii_sensitive"]).default("none"),
});
export type Permission = z.infer<typeof Permission>;

/** User's membership in one Tenant, carrying the roles that apply there (QST-017). */
export const Membership = z.object({
  id: systemFields.id,
  tenant_id: systemFields.tenant_id,
  user_id: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
  role_ids: z.array(z.string().uuid()),
  created_at: systemFields.created_at,
  updated_at: systemFields.updated_at,
  version: systemFields.version,
});
export type Membership = z.infer<typeof Membership>;

/** Lightweight membership+user projection for pickers (e.g. task delegation assignee list). */
export const MembershipSummary = z.object({
  membership_id: z.string().uuid(),
  user_id: z.string().uuid(),
  login_identity: z.string().email(),
  display_name: z.string(),
  status: z.enum(["active", "suspended"]),
});
export type MembershipSummary = z.infer<typeof MembershipSummary>;

// ---- Auth flow DTOs (ADR-0003) ----

export const LoginRequest = z.object({
  login_identity: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const LoginResult = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("authenticated"),
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number().int().positive(),
    memberships: z.array(z.object({ tenant_id: z.string().uuid(), tenant_slug: z.string() })),
  }),
  z.object({
    status: z.literal("mfa_required"),
    mfa_challenge_id: z.string().uuid(),
  }),
]);
export type LoginResult = z.infer<typeof LoginResult>;

export const MfaVerifyRequest = z.object({
  mfa_challenge_id: z.string().uuid(),
  code: z.string().min(6).max(10),
});
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequest>;

export const RefreshRequest = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const SwitchTenantRequest = z.object({
  tenant_id: z.string().uuid(),
});
export type SwitchTenantRequest = z.infer<typeof SwitchTenantRequest>;

export const SessionInfo = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
  user_agent: z.string().nullable(),
  ip_hash: z.string().nullable(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

/** Resolved authorization context threaded through every request (ADR-0003 §Decision, ADR-0004). */
export const AuthContext = z.object({
  user_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  membership_id: z.string().uuid(),
  role_codes: z.array(z.string()),
  mfa_verified: z.boolean(),
});
export type AuthContext = z.infer<typeof AuthContext>;

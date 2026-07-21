/**
 * RBAC + ABAC types per docs/architecture/adr/0004-authorization-model.md and
 * docs/requirements/roles-and-permissions.md §1.
 *
 * Scope predicates, in increasing breadth:
 *  - self     : the object's subject is the actor themself
 *  - owned    : the actor owns the object
 *  - assigned : the object is assigned to the actor (e.g. mentee, task assignee)
 *  - mentored : the object's subject is one of the actor's mentored partners
 *  - branch   : the object is within the actor's network branch, optionally depth-limited
 *  - tenant   : any object within the actor's tenant
 *  - platform : cross-tenant, platform-owner only
 */
export type Scope = "self" | "owned" | "assigned" | "mentored" | "branch" | "tenant" | "platform";

export type FieldSensitivity = "none" | "pii_standard" | "pii_sensitive";

/** One (resource, action) grant or explicit deny carried by a role. */
export interface PermissionBinding {
  resource: string;
  action: string;
  /** "allow" grants; "deny" always wins over any allow for the same (resource, action) (ADR-0004). */
  effect: "allow" | "deny";
  scope: Scope;
  /** Only meaningful when scope === "branch"; null/undefined means unlimited depth. */
  branchDepth?: number | null;
  /** Field-sensitivity classes this binding may read/write; empty/undefined means "none" only. */
  allowedFieldSensitivity?: FieldSensitivity[];
}

/** A role as bound to the acting membership for this request. */
export interface RoleBinding {
  roleCode: string;
  permissions: PermissionBinding[];
}

/** Resolved identity/session context for the current request (see AuthContext in @network-crm/contracts). */
export interface PolicyContext {
  tenantId: string;
  actorUserId: string;
  roles: RoleBinding[];
}

/** Attributes of the specific object being accessed, needed to evaluate the ABAC scope predicate. */
export interface ObjectAttributes {
  tenantId: string;
  ownerUserId?: string;
  assigneeUserId?: string;
  mentorUserId?: string;
  subjectUserId?: string;
  /** Generation distance from the actor's network position, if the object is a network node/partner. */
  branchDistance?: number;
}

export interface AccessRequest {
  resource: string;
  action: string;
  object: ObjectAttributes;
  fieldSensitivity?: FieldSensitivity;
}

export type Decision =
  | { allowed: true; scope: Scope }
  | { allowed: false; reason: DenyReason };

export type DenyReason =
  | "TENANT_MISMATCH"
  | "NO_MATCHING_PERMISSION"
  | "EXPLICIT_DENY"
  | "SCOPE_NOT_SATISFIED"
  | "FIELD_SENSITIVITY_NOT_ALLOWED";

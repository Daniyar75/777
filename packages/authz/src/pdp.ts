import type {
  AccessRequest,
  Decision,
  ObjectAttributes,
  PermissionBinding,
  PolicyContext,
  Scope,
} from "./types.js";

function scopeSatisfied(
  scope: Scope,
  branchDepth: number | null | undefined,
  ctx: PolicyContext,
  object: ObjectAttributes,
): boolean {
  switch (scope) {
    case "self":
      return object.subjectUserId === ctx.actorUserId;
    case "owned":
      return object.ownerUserId === ctx.actorUserId;
    case "assigned":
      return object.assigneeUserId === ctx.actorUserId;
    case "mentored":
      return object.mentorUserId === ctx.actorUserId;
    case "branch":
      return (
        object.branchDistance !== undefined &&
        object.branchDistance >= 0 &&
        (branchDepth == null || object.branchDistance <= branchDepth)
      );
    case "tenant":
      return object.tenantId === ctx.tenantId;
    case "platform":
      // Explicit cross-tenant grant; callers must only bind this scope to a
      // genuinely platform-level permission (break-glass path, SEC-018).
      return true;
    default:
      return false;
  }
}

function matchingBindings(ctx: PolicyContext, resource: string, action: string): PermissionBinding[] {
  const out: PermissionBinding[] = [];
  for (const role of ctx.roles) {
    for (const binding of role.permissions) {
      if (binding.resource === resource && binding.action === action) {
        out.push(binding);
      }
    }
  }
  return out;
}

/**
 * Evaluate an access request against RBAC+ABAC policy (ADR-0004).
 * Deny-by-default: any ambiguity, missing binding, or unsatisfied scope denies.
 * Deny-over-allow: an explicit deny binding always wins, independent of any allow.
 */
export function evaluate(ctx: PolicyContext, req: AccessRequest): Decision {
  const bindings = matchingBindings(ctx, req.resource, req.action);
  const platformBindingExists = bindings.some((b) => b.scope === "platform");

  if (req.object.tenantId !== ctx.tenantId && !platformBindingExists) {
    return { allowed: false, reason: "TENANT_MISMATCH" };
  }

  const denyBinding = bindings.find((b) => b.effect === "deny");
  if (denyBinding) {
    return { allowed: false, reason: "EXPLICIT_DENY" };
  }

  const allowBindings = bindings.filter((b) => b.effect === "allow");
  if (allowBindings.length === 0) {
    return { allowed: false, reason: "NO_MATCHING_PERMISSION" };
  }

  const satisfied = allowBindings.find((b) =>
    scopeSatisfied(b.scope, b.branchDepth, ctx, req.object),
  );
  if (!satisfied) {
    return { allowed: false, reason: "SCOPE_NOT_SATISFIED" };
  }

  const requestedSensitivity = req.fieldSensitivity ?? "none";
  if (requestedSensitivity !== "none") {
    const allowedLevels = satisfied.allowedFieldSensitivity ?? [];
    if (!allowedLevels.includes(requestedSensitivity)) {
      return { allowed: false, reason: "FIELD_SENSITIVITY_NOT_ALLOWED" };
    }
  }

  return { allowed: true, scope: satisfied.scope };
}

export * from "./types.js";

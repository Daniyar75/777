import { describe, expect, it } from "vitest";
import { evaluate } from "./pdp.js";
import type { PolicyContext, AccessRequest } from "./types.js";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";
const OTHER_USER = "44444444-4444-4444-4444-444444444444";

function ctxWith(roles: PolicyContext["roles"], tenantId = TENANT_A): PolicyContext {
  return { tenantId, actorUserId: ACTOR, roles };
}

describe("PDP.evaluate — deny by default", () => {
  it("denies when no role carries the resource/action at all", () => {
    const ctx = ctxWith([]);
    const req: AccessRequest = {
      resource: "contact",
      action: "read",
      object: { tenantId: TENANT_A, ownerUserId: ACTOR },
    };
    const decision = evaluate(ctx, req);
    expect(decision).toEqual({ allowed: false, reason: "NO_MATCHING_PERMISSION" });
  });

  it("denies cross-tenant access even with a matching allow binding", () => {
    const ctx = ctxWith([
      {
        roleCode: "partner",
        permissions: [{ resource: "contact", action: "read", effect: "allow", scope: "tenant" }],
      },
    ]);
    const req: AccessRequest = {
      resource: "contact",
      action: "read",
      object: { tenantId: TENANT_B, ownerUserId: ACTOR },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: false, reason: "TENANT_MISMATCH" });
  });
});

describe("PDP.evaluate — ownership/scope predicates", () => {
  const roles: PolicyContext["roles"] = [
    {
      roleCode: "partner",
      permissions: [{ resource: "contact", action: "update", effect: "allow", scope: "owned" }],
    },
  ];

  it("allows when the actor owns the object", () => {
    const ctx = ctxWith(roles);
    const req: AccessRequest = {
      resource: "contact",
      action: "update",
      object: { tenantId: TENANT_A, ownerUserId: ACTOR },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: true, scope: "owned" });
  });

  it("denies when the actor does not own the object", () => {
    const ctx = ctxWith(roles);
    const req: AccessRequest = {
      resource: "contact",
      action: "update",
      object: { tenantId: TENANT_A, ownerUserId: OTHER_USER },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: false, reason: "SCOPE_NOT_SATISFIED" });
  });
});

describe("PDP.evaluate — branch depth (BRULE-NETWORK-005)", () => {
  const roles: PolicyContext["roles"] = [
    {
      roleCode: "leader",
      permissions: [
        { resource: "network_node", action: "read", effect: "allow", scope: "branch", branchDepth: 3 },
      ],
    },
  ];

  it("allows a node within the configured depth", () => {
    const ctx = ctxWith(roles);
    const req: AccessRequest = {
      resource: "network_node",
      action: "read",
      object: { tenantId: TENANT_A, branchDistance: 2 },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: true, scope: "branch" });
  });

  it("denies a node beyond the configured depth", () => {
    const ctx = ctxWith(roles);
    const req: AccessRequest = {
      resource: "network_node",
      action: "read",
      object: { tenantId: TENANT_A, branchDistance: 4 },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: false, reason: "SCOPE_NOT_SATISFIED" });
  });

  it("unlimited depth (null) allows any distance", () => {
    const ctx = ctxWith([
      {
        roleCode: "leader",
        permissions: [
          { resource: "network_node", action: "read", effect: "allow", scope: "branch", branchDepth: null },
        ],
      },
    ]);
    const req: AccessRequest = {
      resource: "network_node",
      action: "read",
      object: { tenantId: TENANT_A, branchDistance: 50 },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: true, scope: "branch" });
  });
});

describe("PDP.evaluate — deny-over-allow (ADR-0004)", () => {
  it("an explicit deny wins even when another role grants allow", () => {
    const ctx = ctxWith([
      {
        roleCode: "partner",
        permissions: [{ resource: "order", action: "delete", effect: "allow", scope: "tenant" }],
      },
      {
        roleCode: "compliance-hold",
        permissions: [{ resource: "order", action: "delete", effect: "deny", scope: "tenant" }],
      },
    ]);
    const req: AccessRequest = {
      resource: "order",
      action: "delete",
      object: { tenantId: TENANT_A },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: false, reason: "EXPLICIT_DENY" });
  });
});

describe("PDP.evaluate — field sensitivity (SEC-004)", () => {
  it("denies a pii_sensitive field when the binding does not allow it", () => {
    const ctx = ctxWith([
      {
        roleCode: "trainer",
        permissions: [
          {
            resource: "contact",
            action: "read",
            effect: "allow",
            scope: "assigned",
            allowedFieldSensitivity: ["pii_standard"],
          },
        ],
      },
    ]);
    const req: AccessRequest = {
      resource: "contact",
      action: "read",
      object: { tenantId: TENANT_A, assigneeUserId: ACTOR },
      fieldSensitivity: "pii_sensitive",
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: false, reason: "FIELD_SENSITIVITY_NOT_ALLOWED" });
  });

  it("allows a pii_sensitive field when explicitly granted", () => {
    const ctx = ctxWith([
      {
        roleCode: "mentor",
        permissions: [
          {
            resource: "contact",
            action: "read",
            effect: "allow",
            scope: "assigned",
            allowedFieldSensitivity: ["pii_standard", "pii_sensitive"],
          },
        ],
      },
    ]);
    const req: AccessRequest = {
      resource: "contact",
      action: "read",
      object: { tenantId: TENANT_A, assigneeUserId: ACTOR },
      fieldSensitivity: "pii_sensitive",
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: true, scope: "assigned" });
  });
});

describe("PDP.evaluate — platform scope crosses tenant intentionally", () => {
  it("allows a platform-scoped binding across tenants", () => {
    const ctx = ctxWith([
      {
        roleCode: "platform-owner-breakglass",
        permissions: [{ resource: "tenant", action: "read", effect: "allow", scope: "platform" }],
      },
    ]);
    const req: AccessRequest = {
      resource: "tenant",
      action: "read",
      object: { tenantId: TENANT_B },
    };
    expect(evaluate(ctx, req)).toEqual({ allowed: true, scope: "platform" });
  });
});

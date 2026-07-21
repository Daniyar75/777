import type { ActingIdentity, TokenService } from "@network-crm/identity-tenant";
import { ApiHttpError } from "./errors.js";

export interface RequestIdentity {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  membershipId: string | null;
  roleCodes: string[];
  mfaVerified: boolean;
}

export async function requireIdentity(
  authorizationHeader: string | undefined,
  tokenService: TokenService,
): Promise<RequestIdentity> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new ApiHttpError("AUTH_REQUIRED", "Missing bearer token");
  }
  const token = authorizationHeader.slice("Bearer ".length);
  try {
    const claims = await tokenService.verifyAccessToken(token);
    return {
      userId: claims.sub,
      sessionId: claims.session_id,
      tenantId: claims.tenant_id,
      membershipId: claims.membership_id,
      roleCodes: claims.role_codes,
      mfaVerified: claims.mfa_verified,
    };
  } catch {
    throw new ApiHttpError("AUTH_REQUIRED", "Invalid or expired access token");
  }
}

/** Most routes need an active tenant context (ADR-0003: identity-only sessions must switch first). */
export function requireTenantIdentity(identity: RequestIdentity): ActingIdentity {
  if (!identity.tenantId || !identity.membershipId) {
    throw new ApiHttpError("AUTH_REQUIRED", "Select an active tenant first (POST /auth/switch-tenant)");
  }
  return { tenantId: identity.tenantId, membershipId: identity.membershipId, actorUserId: identity.userId };
}

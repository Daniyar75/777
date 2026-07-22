/** Mirrors services-or-modules/identity-tenant/src/tokens.ts AccessTokenClaims. */
export interface AccessTokenClaims {
  sub: string;
  session_id: string;
  tenant_id: string | null;
  membership_id: string | null;
  role_codes: string[];
  mfa_verified: boolean;
}

/**
 * Decodes the JWT payload without verifying the signature — used only to drive UI state
 * (which tenant is active, whose session this is). The server independently verifies and
 * re-derives authorization on every request (ADR-0004); nothing here is a security decision.
 */
export function decodeAccessToken(token: string): AccessTokenClaims {
  const [, payloadB64] = token.split(".");
  if (!payloadB64) throw new Error("Malformed access token");
  const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as AccessTokenClaims;
}

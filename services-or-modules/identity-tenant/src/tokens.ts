import { SignJWT, jwtVerify } from "jose";

/** Claims carried by a short-lived access token (ADR-0003). */
export interface AccessTokenClaims {
  sub: string; // user id
  session_id: string;
  tenant_id: string | null;
  membership_id: string | null;
  role_codes: string[];
  mfa_verified: boolean;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface TokenService {
  signAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

/**
 * HS256-signed access tokens. The secret is injected, never read from process.env inside
 * this module, so the service stays unit-testable and the secret's source (env var, secret
 * manager, ...) is a composition-root (apps/api) concern.
 */
export function createTokenService(secret: string): TokenService {
  const key = new TextEncoder().encode(secret);

  return {
    async signAccessToken(claims) {
      const token = await new SignJWT({ ...claims })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(key);
      return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
    },

    async verifyAccessToken(token) {
      const { payload } = await jwtVerify(token, key);
      return {
        sub: payload.sub as string,
        session_id: payload.session_id as string,
        tenant_id: (payload.tenant_id as string | null) ?? null,
        membership_id: (payload.membership_id as string | null) ?? null,
        role_codes: (payload.role_codes as string[] | undefined) ?? [],
        mfa_verified: Boolean(payload.mfa_verified),
      };
    },
  };
}

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { schema, withActingUserContext, withTenantContext, type Database } from "@network-crm/database";
import { hashPassword, hashToken, randomToken, verifyPassword, generateTotpSecret, verifyTotp } from "@network-crm/crypto";
import type { LoginResult, MfaVerifyRequest, SessionInfo } from "@network-crm/contracts";
import { DomainError } from "./errors.js";
import { createTokenService, type TokenService } from "./tokens.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface RequestMeta {
  userAgent?: string | null;
  ipHash?: string | null;
}

export interface AuthenticatedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Anti-enumeration: every credential-rejection path throws the same error (UI-001, API-001). */
const INVALID_CREDENTIALS = new DomainError("AUTH_REQUIRED", "Invalid credentials");

async function getRoleCodes(db: Database, tenantId: string, membershipId: string): Promise<string[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ code: schema.roles.code })
      .from(schema.membershipRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.membershipRoles.roleId))
      .where(eq(schema.membershipRoles.membershipId, membershipId));
    return rows.map((r) => r.code);
  });
}

async function issueSession(
  db: Database,
  tokenService: TokenService,
  params: {
    userId: string;
    tenantId: string | null;
    membershipId: string | null;
    roleCodes: string[];
    mfaVerified: boolean;
    meta: RequestMeta;
  },
): Promise<AuthenticatedTokens> {
  const sessionId = randomUUID();
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId: params.userId,
    tenantId: params.tenantId,
    membershipId: params.membershipId,
    kind: params.tenantId ? "tenant" : "identity",
    mfaVerified: params.mfaVerified,
    userAgent: params.meta.userAgent ?? null,
    ipHash: params.meta.ipHash ?? null,
  });

  const refreshPlaintext = randomToken();
  await db.insert(schema.refreshTokens).values({
    id: randomUUID(),
    sessionId,
    tokenHash: hashToken(refreshPlaintext),
    familyId: randomUUID(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  const { token, expiresIn } = await tokenService.signAccessToken({
    sub: params.userId,
    session_id: sessionId,
    tenant_id: params.tenantId,
    membership_id: params.membershipId,
    role_codes: params.roleCodes,
    mfa_verified: params.mfaVerified,
  });

  return { access_token: token, refresh_token: refreshPlaintext, expires_in: expiresIn };
}

/**
 * memberships is RLS-scoped per tenant (ADR-0002), so listing a user's OWN memberships
 * across every tenant they belong to — needed here before any tenant has been selected,
 * QST-017 — goes through the self_membership_lookup policy (see
 * infra/database/migrations/0002_membership_self_lookup.sql) via app.acting_user_id,
 * not through app.tenant_id.
 */
async function activeMembershipsWithSlug(
  db: Database,
  userId: string,
): Promise<Array<{ tenant_id: string; tenant_slug: string }>> {
  return withActingUserContext(db, userId, async (tx) => {
    const rows = await tx
      .select({ tenantId: schema.memberships.tenantId, slug: schema.tenants.slug })
      .from(schema.memberships)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, "active")));
    return rows.map((r) => ({ tenant_id: r.tenantId, tenant_slug: r.slug }));
  });
}

export async function login(
  db: Database,
  tokenService: TokenService,
  input: { login_identity: string; password: string },
  meta: RequestMeta = {},
): Promise<LoginResult> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.loginIdentity, input.login_identity));
  if (!user || user.status !== "active") throw INVALID_CREDENTIALS;

  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) throw INVALID_CREDENTIALS;

  if (user.mfaEnabled) {
    const challengeId = randomUUID();
    await db.insert(schema.mfaChallenges).values({
      id: challengeId,
      userId: user.id,
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
    });
    return { status: "mfa_required", mfa_challenge_id: challengeId };
  }

  const tokens = await issueSession(db, tokenService, {
    userId: user.id,
    tenantId: null,
    membershipId: null,
    roleCodes: [],
    mfaVerified: false,
    meta,
  });
  const memberships = await activeMembershipsWithSlug(db, user.id);
  return { status: "authenticated", ...tokens, memberships };
}

export async function verifyMfa(
  db: Database,
  tokenService: TokenService,
  input: MfaVerifyRequest,
  meta: RequestMeta = {},
): Promise<LoginResult> {
  const [challenge] = await db
    .select()
    .from(schema.mfaChallenges)
    .where(eq(schema.mfaChallenges.id, input.mfa_challenge_id));

  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() < Date.now()) {
    throw new DomainError("AUTH_REQUIRED", "MFA challenge is invalid or expired");
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, challenge.userId));
  if (!user || !user.mfaSecret) throw INVALID_CREDENTIALS;

  if (!verifyTotp(user.mfaSecret, input.code)) {
    throw new DomainError("AUTH_REQUIRED", "Invalid MFA code");
  }

  await db
    .update(schema.mfaChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(schema.mfaChallenges.id, challenge.id), isNull(schema.mfaChallenges.consumedAt)));

  const tokens = await issueSession(db, tokenService, {
    userId: user.id,
    tenantId: null,
    membershipId: null,
    roleCodes: [],
    mfaVerified: true,
    meta,
  });
  const memberships = await activeMembershipsWithSlug(db, user.id);
  return { status: "authenticated", ...tokens, memberships };
}

export async function switchTenant(
  db: Database,
  tokenService: TokenService,
  params: { userId: string; tenantId: string; mfaVerified: boolean; meta?: RequestMeta },
): Promise<AuthenticatedTokens> {
  const membership = await withTenantContext(db, params.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.userId, params.userId), eq(schema.memberships.status, "active")));
    return row;
  });
  if (!membership) {
    throw new DomainError("PERMISSION_DENIED", "No active membership in this tenant");
  }

  const roleCodes = await getRoleCodes(db, params.tenantId, membership.id);

  return issueSession(db, tokenService, {
    userId: params.userId,
    tenantId: params.tenantId,
    membershipId: membership.id,
    roleCodes,
    mfaVerified: params.mfaVerified,
    meta: params.meta ?? {},
  });
}

export async function refreshSession(
  db: Database,
  tokenService: TokenService,
  refreshTokenPlaintext: string,
): Promise<AuthenticatedTokens> {
  const tokenHash = hashToken(refreshTokenPlaintext);
  const [tokenRow] = await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.tokenHash, tokenHash));
  if (!tokenRow) throw new DomainError("AUTH_REQUIRED", "Invalid refresh token");

  if (tokenRow.revokedAt) {
    // Reuse of an already-rotated refresh token: treat as a stolen-token signal and
    // revoke the entire family + its session (SEC-006).
    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.familyId, tokenRow.familyId), isNull(schema.refreshTokens.revokedAt)));
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, tokenRow.sessionId));
    throw new DomainError("AUTH_REQUIRED", "Refresh token reuse detected; session revoked");
  }
  if (tokenRow.expiresAt.getTime() < Date.now()) {
    throw new DomainError("AUTH_REQUIRED", "Refresh token expired");
  }

  const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, tokenRow.sessionId));
  if (!session || session.revokedAt) {
    throw new DomainError("AUTH_REQUIRED", "Session revoked");
  }

  const newTokenId = randomUUID();
  const newPlaintext = randomToken();
  await db.insert(schema.refreshTokens).values({
    id: newTokenId,
    sessionId: session.id,
    tokenHash: hashToken(newPlaintext),
    familyId: tokenRow.familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date(), replacedById: newTokenId })
    .where(eq(schema.refreshTokens.id, tokenRow.id));
  await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, session.id));

  const roleCodes = session.tenantId && session.membershipId ? await getRoleCodes(db, session.tenantId, session.membershipId) : [];

  const { token, expiresIn } = await tokenService.signAccessToken({
    sub: session.userId,
    session_id: session.id,
    tenant_id: session.tenantId,
    membership_id: session.membershipId,
    role_codes: roleCodes,
    mfa_verified: session.mfaVerified,
  });

  return { access_token: token, refresh_token: newPlaintext, expires_in: expiresIn };
}

export async function revokeSession(db: Database, sessionId: string, actingUserId: string): Promise<void> {
  const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
  if (!session || session.userId !== actingUserId) {
    throw new DomainError("PERMISSION_DENIED", "Cannot revoke a session that is not your own");
  }
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.refreshTokens.sessionId, sessionId), isNull(schema.refreshTokens.revokedAt)));
}

export async function listSessions(db: Database, userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
  return rows.map((r) => ({
    id: r.id,
    created_at: r.createdAt.toISOString(),
    last_seen_at: r.lastSeenAt.toISOString(),
    user_agent: r.userAgent,
    ip_hash: r.ipHash,
    current: r.id === currentSessionId,
  }));
}

// ---- MFA enrollment (UI-021 profile) ----

export async function beginMfaEnrollment(db: Database, userId: string): Promise<{ secret: string }> {
  const secret = generateTotpSecret();
  await db.update(schema.users).set({ mfaSecret: secret }).where(eq(schema.users.id, userId));
  return { secret };
}

export async function confirmMfaEnrollment(db: Database, userId: string, code: string): Promise<void> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user || !user.mfaSecret) {
    throw new DomainError("VALIDATION_FAILED", "No pending MFA enrollment for this user");
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    throw new DomainError("VALIDATION_FAILED", "Invalid MFA code");
  }
  await db.update(schema.users).set({ mfaEnabled: true }).where(eq(schema.users.id, userId));
}

export { createTokenService };
export type { TokenService };

import { computeTotp } from "@network-crm/crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertMembership, insertTenant, insertUser, truncateAll } from "@network-crm/test-support";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  createTokenService,
  listSessions,
  login,
  refreshSession,
  revokeSession,
  switchTenant,
  verifyMfa,
} from "./index.js";

const { db, close } = createTestDb();
const tokenService = createTokenService("test-secret-not-for-production");

beforeEach(async () => {
  await truncateAll(db);
});
afterAll(async () => {
  await close();
});

describe("login (ADR-0003)", () => {
  it("authenticates with correct credentials and lists active memberships", async () => {
    const tenant = await insertTenant(db);
    const user = await insertUser(db, { password: "correct horse" });
    await insertMembership(db, tenant.id, user.id);

    const result = await login(db, tokenService, { login_identity: user.loginIdentity, password: "correct horse" });
    expect(result.status).toBe("authenticated");
    if (result.status === "authenticated") {
      expect(result.access_token).toBeTruthy();
      expect(result.refresh_token).toBeTruthy();
      expect(result.memberships.map((m) => m.tenant_id)).toContain(tenant.id);
    }
  });

  it("rejects wrong password and unknown user with the identical error (anti-enumeration)", async () => {
    const user = await insertUser(db, { password: "correct horse" });

    let unknownUserError: unknown;
    let wrongPasswordError: unknown;
    try {
      await login(db, tokenService, { login_identity: "nobody@example.test", password: "whatever" });
    } catch (err) {
      unknownUserError = err;
    }
    try {
      await login(db, tokenService, { login_identity: user.loginIdentity, password: "wrong" });
    } catch (err) {
      wrongPasswordError = err;
    }

    expect((unknownUserError as Error).message).toBe((wrongPasswordError as Error).message);
    expect((unknownUserError as { code?: string }).code).toBe("AUTH_REQUIRED");
  });

  it("requires MFA when enabled, and verifyMfa completes login with a valid TOTP code", async () => {
    const user = await insertUser(db, { password: "correct horse" });
    const { secret } = await beginMfaEnrollment(db, user.id);
    await confirmMfaEnrollment(db, user.id, computeTotp(secret));

    const first = await login(db, tokenService, { login_identity: user.loginIdentity, password: "correct horse" });
    expect(first.status).toBe("mfa_required");
    if (first.status !== "mfa_required") throw new Error("expected mfa_required");

    const code = computeTotp(secret);
    const result = await verifyMfa(db, tokenService, { mfa_challenge_id: first.mfa_challenge_id, code });
    expect(result.status).toBe("authenticated");
  });

  it("rejects a wrong MFA code", async () => {
    const user = await insertUser(db, { password: "correct horse" });
    const { secret } = await beginMfaEnrollment(db, user.id);
    await confirmMfaEnrollment(db, user.id, computeTotp(secret));

    const first = await login(db, tokenService, { login_identity: user.loginIdentity, password: "correct horse" });
    if (first.status !== "mfa_required") throw new Error("expected mfa_required");

    await expect(
      verifyMfa(db, tokenService, { mfa_challenge_id: first.mfa_challenge_id, code: "000000" }),
    ).rejects.toThrow();
  });
});

describe("switchTenant (QST-017)", () => {
  it("mints a tenant-scoped session only for an active membership", async () => {
    const tenant = await insertTenant(db);
    const user = await insertUser(db);
    await insertMembership(db, tenant.id, user.id);

    const tokens = await switchTenant(db, tokenService, { userId: user.id, tenantId: tenant.id, mfaVerified: false });
    const claims = await tokenService.verifyAccessToken(tokens.access_token);
    expect(claims.tenant_id).toBe(tenant.id);
  });

  it("denies switching into a tenant with no membership", async () => {
    const tenant = await insertTenant(db);
    const user = await insertUser(db);
    // no membership created

    await expect(
      switchTenant(db, tokenService, { userId: user.id, tenantId: tenant.id, mfaVerified: false }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("refresh token rotation (SEC-006)", () => {
  it("rotates the refresh token and keeps the session usable", async () => {
    const tenant = await insertTenant(db);
    const user = await insertUser(db, { password: "correct horse" });
    await insertMembership(db, tenant.id, user.id);
    const login1 = await login(db, tokenService, { login_identity: user.loginIdentity, password: "correct horse" });
    if (login1.status !== "authenticated") throw new Error("expected authenticated");

    const refreshed = await refreshSession(db, tokenService, login1.refresh_token);
    expect(refreshed.refresh_token).not.toBe(login1.refresh_token);
    expect(refreshed.access_token).toBeTruthy();
  });

  it("detects refresh-token reuse and revokes the whole session family", async () => {
    const user = await insertUser(db, { password: "correct horse" });
    const login1 = await login(db, tokenService, { login_identity: user.loginIdentity, password: "correct horse" });
    if (login1.status !== "authenticated") throw new Error("expected authenticated");

    const first = await refreshSession(db, tokenService, login1.refresh_token);
    expect(first.access_token).toBeTruthy();

    // Reusing the already-rotated (now revoked) original refresh token must fail...
    await expect(refreshSession(db, tokenService, login1.refresh_token)).rejects.toThrow(/reuse detected/);

    // ...and the legitimate rotated token must now be dead too (whole family revoked).
    await expect(refreshSession(db, tokenService, first.refresh_token)).rejects.toThrow();
  });
});

describe("session revocation", () => {
  it("lets a user revoke their own session but not someone else's", async () => {
    const userA = await insertUser(db, { password: "pw" });
    const userB = await insertUser(db, { password: "pw" });
    const loginA = await login(db, tokenService, { login_identity: userA.loginIdentity, password: "pw" });
    if (loginA.status !== "authenticated") throw new Error("expected authenticated");
    const claimsA = await tokenService.verifyAccessToken(loginA.access_token);

    await expect(revokeSession(db, claimsA.session_id, userB.id)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });

    await revokeSession(db, claimsA.session_id, userA.id);
    const sessions = await listSessions(db, userA.id);
    expect(sessions.find((s) => s.id === claimsA.session_id)).toBeUndefined();
  });
});

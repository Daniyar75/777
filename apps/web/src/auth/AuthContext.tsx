import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LoginResult } from "@network-crm/contracts";
import { apiPost, apiRequest, configureApiClient, HttpError } from "../api/client.js";
import { decodeAccessToken } from "./jwt.js";

const REFRESH_TOKEN_STORAGE_KEY = "network_crm_refresh_token";

export type Membership = { tenant_id: string; tenant_slug: string };

export type AuthState =
  | { status: "booting" }
  | { status: "unauthenticated" }
  | { status: "mfa_required"; mfaChallengeId: string }
  | { status: "choosing_tenant"; memberships: Membership[] }
  | { status: "authenticated"; tenantId: string; roleCodes: string[] };

interface AuthContextValue {
  state: AuthState;
  login: (loginIdentity: string, password: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  selectTenant: (tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Non-null only while status === "authenticated" or "choosing_tenant" (identity-level token). */
  hasSession: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "booting" });
  // In-memory only: the identity-level access token issued by login()/verifyMfa(), before a
  // tenant is chosen. Never persisted — see docs/architecture/adr/0011-frontend-tech-stack.md.
  const identityAccessToken = useRef<string | null>(null);
  // The active, tenant-scoped access token, once chosen. Also in-memory; only the refresh
  // token (which can mint a new one) is persisted, and only after tenant selection.
  const tenantAccessToken = useRef<string | null>(null);
  const tenantRefreshToken = useRef<string | null>(null);

  const applyAuthenticatedTokens = useCallback((accessToken: string, refreshToken: string, persist: boolean) => {
    const claims = decodeAccessToken(accessToken);
    tenantAccessToken.current = accessToken;
    tenantRefreshToken.current = refreshToken;
    if (persist) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }
    setState({ status: "authenticated", tenantId: claims.tenant_id ?? "", roleCodes: claims.role_codes });
  }, []);

  const handleLoginResult = useCallback(
    (result: LoginResult) => {
      if (result.status === "mfa_required") {
        setState({ status: "mfa_required", mfaChallengeId: result.mfa_challenge_id });
        return;
      }
      identityAccessToken.current = result.access_token;
      if (result.memberships.length === 1) {
        // Fire and forget from the caller's perspective; selectTenant sets state itself.
        void selectTenantInternal(result.memberships[0]!.tenant_id);
      } else {
        setState({ status: "choosing_tenant", memberships: result.memberships });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectTenantInternal = useCallback(
    async (tenantId: string) => {
      const token = identityAccessToken.current;
      if (!token) throw new Error("No identity session to switch tenant from");
      const result = await apiPost<{ access_token: string; refresh_token: string; expires_in: number }>(
        "/auth/switch-tenant",
        { tenant_id: tenantId },
        { headers: { Authorization: `Bearer ${token}` }, allowRefreshRetry: false },
      );
      identityAccessToken.current = null;
      applyAuthenticatedTokens(result.access_token, result.refresh_token, true);
    },
    [applyAuthenticatedTokens],
  );

  const refreshTenantSession = useCallback(async (): Promise<string | null> => {
    const stored = tenantRefreshToken.current ?? localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (!stored) return null;
    try {
      const result = await apiPost<{ access_token: string; refresh_token: string; expires_in: number }>(
        "/sessions/refresh",
        { refresh_token: stored },
        { anonymous: true, allowRefreshRetry: false },
      );
      applyAuthenticatedTokens(result.access_token, result.refresh_token, true);
      return result.access_token;
    } catch {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      tenantAccessToken.current = null;
      tenantRefreshToken.current = null;
      setState({ status: "unauthenticated" });
      return null;
    }
  }, [applyAuthenticatedTokens]);

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => tenantAccessToken.current ?? identityAccessToken.current,
      onUnauthorized: refreshTenantSession,
    });
  }, [refreshTenantSession]);

  useEffect(() => {
    // Boot: resume a tenant-scoped session from a persisted refresh token, if any.
    void (async () => {
      const stored = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
      if (!stored) {
        setState({ status: "unauthenticated" });
        return;
      }
      const token = await refreshTenantSession();
      if (!token) setState({ status: "unauthenticated" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (loginIdentity: string, password: string) => {
      const result = await apiPost<LoginResult>(
        "/auth/login",
        { login_identity: loginIdentity, password },
        { anonymous: true },
      );
      handleLoginResult(result);
    },
    [handleLoginResult],
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      if (state.status !== "mfa_required") throw new Error("No MFA challenge pending");
      const result = await apiPost<LoginResult>(
        "/auth/mfa/verify",
        { mfa_challenge_id: state.mfaChallengeId, code },
        { anonymous: true },
      );
      handleLoginResult(result);
    },
    [state, handleLoginResult],
  );

  const selectTenant = useCallback(
    async (tenantId: string) => {
      await selectTenantInternal(tenantId);
    },
    [selectTenantInternal],
  );

  const logout = useCallback(async () => {
    const token = tenantAccessToken.current;
    if (token) {
      try {
        const { session_id } = decodeAccessToken(token);
        // Best-effort: revoke server-side (DELETE /sessions/:id), but always clear local state
        // even if this fails (e.g. the session was already revoked from another device).
        await apiRequest(`/sessions/${session_id}`, { method: "DELETE", allowRefreshRetry: false });
      } catch {
        // ignore — see comment above
      }
    }
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    identityAccessToken.current = null;
    tenantAccessToken.current = null;
    tenantRefreshToken.current = null;
    setState({ status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login,
      verifyMfa,
      selectTenant,
      logout,
      hasSession: state.status === "authenticated" || state.status === "choosing_tenant",
    }),
    [state, login, verifyMfa, selectTenant, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { HttpError };

import type { ApiError } from "@network-crm/contracts";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

/** Thrown for every non-2xx response; body matches docs/api/error-catalog.md's ApiError shape. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

type TokenAccessor = () => string | null;
type UnauthorizedHandler = () => Promise<string | null>;

let getAccessToken: TokenAccessor = () => null;
let handleUnauthorized: UnauthorizedHandler = async () => null;

/** Wired once by AuthProvider so the client never imports auth state directly (no cycle). */
export function configureApiClient(opts: { getAccessToken: TokenAccessor; onUnauthorized: UnauthorizedHandler }): void {
  getAccessToken = opts.getAccessToken;
  handleUnauthorized = opts.onUnauthorized;
}

async function rawFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  try {
    return (await res.json()) as ApiError;
  } catch {
    return {
      code: "VALIDATION_FAILED",
      message: `Request failed with HTTP ${res.status}`,
      correlation_id: "unknown",
      retryable: res.status >= 500,
    };
  }
}

export interface ApiRequestOptions extends RequestInit {
  /** Set false for the login/refresh calls themselves, to avoid an infinite refresh loop. */
  allowRefreshRetry?: boolean;
  /** Skip attaching a bearer token entirely (login, tenant-free endpoints). */
  anonymous?: boolean;
}

async function performRequest(path: string, options: ApiRequestOptions): Promise<Response> {
  const { allowRefreshRetry = true, anonymous = false, ...init } = options;
  const token = anonymous ? null : getAccessToken();

  let res = await rawFetch(path, init, token);

  if (res.status === 401 && allowRefreshRetry && !anonymous) {
    const refreshedToken = await handleUnauthorized();
    if (refreshedToken) {
      res = await rawFetch(path, init, refreshedToken);
    }
  }

  if (!res.ok) {
    throw new HttpError(res.status, await parseErrorBody(res));
  }
  return res;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const res = await performRequest(path, options);
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** For endpoints that return a non-JSON body, e.g. GET /contacts/export's CSV (BL-203). */
export async function apiRequestText(path: string, options: ApiRequestOptions = {}): Promise<string> {
  const res = await performRequest(path, options);
  return res.text();
}

export function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPut<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
}

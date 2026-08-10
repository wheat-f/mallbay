import type { AuthResponse } from "@mallbay/shared";
import { useAuthStore } from "../stores/auth-store";
import { createApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
const AUTH_PATH = "/auth";
const REFRESH_PATH = "/auth/refresh";
let pendingRefreshSession: Promise<boolean> | null = null;

export type ApiOptions = RequestInit & {
  auth?: boolean;
};

export async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const requestId = method !== "GET" && method !== "HEAD" ? createRequestId() : undefined;
  const nextOptions = requestId ? { ...options, headers: { ...(options.headers as Record<string, string> | undefined), "X-Request-Id": requestId } } : options;
  return requestWithAuthRetry<T>(path, nextOptions, (token) => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }));
}

export async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  return requestWithAuthRetry<T>(
    path,
    {
      method: "POST",
      body: formData,
      headers: { "X-Request-Id": createRequestId() }
    },
    (token) => ({
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    })
  );
}

function createRequestId() {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `req_web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function requestWithAuthRetry<T>(
  path: string,
  options: ApiOptions,
  buildAuthHeaders: (token: string | null) => Record<string, string>
): Promise<T> {
  const { auth = true, headers, ...init } = options;
  await restoreSessionBeforeFirstRequest(path, auth);
  const response = await fetchWithAuth(path, init, headers, auth, buildAuthHeaders);

  if (!response.ok) {
    if (auth && response.status === 401 && path !== REFRESH_PATH) {
      const refreshed = await refreshSession();
      if (refreshed) {
        const retry = await fetchWithAuth(path, init, headers, auth, buildAuthHeaders);
        if (retry.ok) {
          return parseJsonResponse<T>(retry);
        }
        const retryErrorBody = await parseJsonResponse<Record<string, unknown>>(retry).catch(() => ({}));
        throw createApiError(retry.status, retryErrorBody);
      }
      handleSessionExpired();
    }

    const errorBody = await parseJsonResponse<Record<string, unknown>>(response).catch(() => ({}));
    throw createApiError(response.status, errorBody);
  }

  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (typeof response.text !== "function") return response.json() as Promise<T>;
  const body = await response.text();
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}

async function restoreSessionBeforeFirstRequest(path: string, auth: boolean) {
  if (!auth || path === REFRESH_PATH) return;

  const { accessToken, user } = useAuthStore.getState();
  if (accessToken || !user) return;

  pendingRefreshSession ??= refreshSession().finally(() => {
    pendingRefreshSession = null;
  });
  await pendingRefreshSession;
}

function fetchWithAuth(
  path: string,
  init: RequestInit,
  headers: HeadersInit | undefined,
  auth: boolean,
  buildAuthHeaders: (token: string | null) => Record<string, string>
) {
  const token = auth ? useAuthStore.getState().accessToken : null;
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...buildAuthHeaders(token),
      ...headers
    }
  });
}

async function refreshSession() {
  const response = await fetch(`${API_URL}${REFRESH_PATH}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    return false;
  }

  const session = await parseJsonResponse<AuthResponse | undefined>(response);
  if (!session) return false;
  useAuthStore.getState().setSession(session);
  return true;
}

function handleSessionExpired() {
  useAuthStore.getState().clearSession();

  if (typeof window === "undefined" || window.location.pathname === AUTH_PATH) {
    return;
  }

  window.location.assign(AUTH_PATH);
}

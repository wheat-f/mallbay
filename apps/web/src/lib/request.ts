import type { AuthResponse } from "@mallbay/shared";
import { useAuthStore } from "../stores/auth-store";
import { createApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const AUTH_PATH = "/auth";
const REFRESH_PATH = "/auth/refresh";

export type ApiOptions = RequestInit & {
  auth?: boolean;
};

export async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return requestWithAuthRetry<T>(path, options, (token) => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }));
}

export async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  return requestWithAuthRetry<T>(
    path,
    {
      method: "POST",
      body: formData
    },
    (token) => ({
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    })
  );
}

async function requestWithAuthRetry<T>(
  path: string,
  options: ApiOptions,
  buildAuthHeaders: (token: string | null) => Record<string, string>
): Promise<T> {
  const { auth = true, headers, ...init } = options;
  const response = await fetchWithAuth(path, init, headers, auth, buildAuthHeaders);

  if (!response.ok) {
    if (auth && response.status === 401 && path !== REFRESH_PATH) {
      const refreshed = await refreshSession();
      if (refreshed) {
        const retry = await fetchWithAuth(path, init, headers, auth, buildAuthHeaders);
        if (retry.ok) {
          return retry.json() as Promise<T>;
        }
        const retryErrorBody = await retry.json().catch(() => ({}));
        throw createApiError(retry.status, retryErrorBody);
      }
      handleSessionExpired();
    }

    const errorBody = await response.json().catch(() => ({}));
    throw createApiError(response.status, errorBody);
  }

  return response.json() as Promise<T>;
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

  const session = (await response.json()) as AuthResponse;
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

import { useAuthStore } from "../stores/auth-store";
import { createApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export type ApiOptions = RequestInit & {
  auth?: boolean;
};

export async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...init } = options;
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw createApiError(response.status, errorBody);
  }

  return response.json() as Promise<T>;
}

export async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw createApiError(response.status, errorBody);
  }

  return response.json() as Promise<T>;
}

import type { AuthResponse, LoginPayload, RegisterPayload } from "@mallbay/shared";
import { useAuthStore } from "../stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApiOptions = RequestInit & {
  auth?: boolean;
};

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
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
    throw new Error(errorBody.message ?? "请求失败");
  }

  return response.json() as Promise<T>;
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload)
    }),
  login: (payload: LoginPayload) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload)
    }),
  logout: () =>
    request<{ success: boolean }>("/auth/logout", {
      method: "POST"
    }),
  me: () => request<AuthResponse["user"]>("/auth/me")
};

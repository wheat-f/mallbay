import type {
  AuthResponse,
  AuthUser,
  BindEmailPayload,
  BindPhonePayload,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload
} from "@mallbay/shared";
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

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
      // 不设 Content-Type，让浏览器自动生成 multipart boundary
    },
    body: formData
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

export const userApi = {
  updateProfile: (payload: UpdateProfilePayload) =>
    request<AuthUser>("/users/profile", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestMultipart<AuthUser>("/users/avatar", form);
  },

  changePassword: (payload: ChangePasswordPayload) =>
    request<{ success: boolean }>("/users/password", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  bindEmail: (payload: BindEmailPayload) =>
    request<AuthUser>("/users/bind/email", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  bindPhone: (payload: BindPhonePayload) =>
    request<AuthUser>("/users/bind/phone", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

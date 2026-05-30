import type {
  AuthResponse,
  AuthPublicKeyResponse,
  AuthUser,
  BindEmailPayload,
  BindPhonePayload,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload
} from "@mallbay/shared";
import { request, requestMultipart } from "../../lib/request";
import { encryptPassword } from "./credential-encryption";

export const authApi = {
  publicKey: () =>
    request<AuthPublicKeyResponse>("/auth/public-key", {
      auth: false
    }),
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
  registerEncrypted: async (payload: RegisterPayload) => {
    const publicKey = await authApi.publicKey();
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        username: payload.username,
        encryptedPassword: await encryptPassword(payload.password, publicKey)
      })
    });
  },
  loginEncrypted: async (payload: LoginPayload) => {
    const publicKey = await authApi.publicKey();
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        identifier: payload.identifier,
        encryptedPassword: await encryptPassword(payload.password, publicKey)
      })
    });
  },
  refresh: () =>
    request<AuthResponse>("/auth/refresh", {
      method: "POST",
      auth: false,
      body: JSON.stringify({})
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
    }),

  searchUsers: (keyword: string) =>
    request<
      {
        id: string;
        username: string;
        nickname: string | null;
        avatarUrl: string | null;
        isAuditor: boolean;
      }[]
    >(`/users/search?q=${encodeURIComponent(keyword)}`)
};

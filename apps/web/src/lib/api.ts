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
import { createApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
    throw createApiError(response.status, errorBody);
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
    throw createApiError(response.status, errorBody);
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
    }),

  searchUsers: (keyword: string) =>
    request<{ id: string; username: string; nickname: string | null; avatarUrl: string | null; isAuditor: boolean }[]>(
      `/users/search?q=${encodeURIComponent(keyword)}`
    )
};

export type StoreListItem = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  coverUrl: string | null;
};

export type StoreDetail = {
  id: string;
  name: string;
  status: string;
  address: string | null;
  description: string | null;
  createdAt: string;
  photos: { id: string; url: string; isCover: boolean; order: number }[];
};

export type StoreListResult = {
  total: number;
  page: number;
  pageSize: number;
  items: StoreListItem[];
};

export const storeApi = {
  create: (payload: { name: string; managerId: string }) =>
    request<{ id: string; name: string; status: string }>("/stores", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  list: (params: { q?: string; page?: number; pageSize?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    const query = qs.toString();
    return request<StoreListResult>(`/stores${query ? `?${query}` : ""}`, { auth: false });
  },

  // 公开门店详情
  getStore: (id: string) =>
    request<StoreDetail>(`/stores/${id}`, { auth: false }),

  // 审核员：全量门店列表
  adminList: (params: { q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    const query = qs.toString();
    return request<{
      total: number; page: number; pageSize: number;
      items: {
        id: string; name: string; status: string;
        address: string | null; coverUrl: string | null;
        manager: { id: string; username: string; nickname: string | null } | null;
        createdAt: string;
      }[];
    }>(`/stores/admin/all${query ? `?${query}` : ""}`);
  },

  // 审核员：待审核列表
  pendingSubmissions: () =>
    request<{
      id: string; name: string; address: string | null; description: string | null;
      status: string; createdAt: string;
      store: { id: string; name: string; status: string };
      submittedBy: { id: string; username: string; nickname: string | null };
    }[]>("/stores/admin/pending-submissions"),

  // 审核员：门店详情（含待审核提交）
  adminGetStore: (id: string) =>
    request<{
      id: string; name: string; status: string;
      address: string | null; description: string | null; createdAt: string;
      photos: { id: string; url: string; isCover: boolean; order: number }[];
      manager: { id: string; username: string; nickname: string | null; avatarUrl: string | null } | null;
      pendingSubmission: {
        id: string; name: string; address: string | null; description: string | null; createdAt: string;
        photos: { id: string; url: string; isCover: boolean; order: number }[];
        submittedBy: { id: string; username: string; nickname: string | null };
      } | null;
    }>(`/stores/admin/${id}`),

  // 审核员：审核提交
  reviewSubmission: (submissionId: string, payload: { action: "APPROVE" | "REJECT"; reviewNote?: string }) =>
    request<{ success: boolean }>(`/stores/submissions/${submissionId}/review`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  // 审核员：冻结 / 解冻
  freeze: (id: string) =>
    request<{ success: boolean }>(`/stores/${id}/freeze`, { method: "PATCH" }),
  unfreeze: (id: string) =>
    request<{ success: boolean }>(`/stores/${id}/unfreeze`, { method: "PATCH" }),

  // 审核员：变更店长
  changeManager: (id: string, newManagerId: string) =>
    request<{ success: boolean }>(`/stores/${id}/manager`, {
      method: "PATCH",
      body: JSON.stringify({ newManagerId })
    }),

  // 店长：上传门店照片（返回 OSS URL）
  uploadPhoto: (storeId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestMultipart<{ url: string }>(`/stores/${storeId}/photos/upload`, form);
  },

  // 店长：提交门店信息送审
  submitStore: (
    id: string,
    payload: {
      name: string;
      address: string;
      description: string;
      photos: { url: string; isCover: boolean; order: number }[];
    }
  ) =>
    request<{ id: string }>(`/stores/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  // 店长：门店详情（含成员列表）
  myStore: (id: string) =>
    request<{
      id: string; name: string; status: string;
      address: string | null; description: string | null;
      photos: { id: string; url: string; isCover: boolean; order: number }[];
      members: {
        id: string; position: string;
        user: { id: string; username: string; nickname: string | null; avatarUrl: string | null };
      }[];
    }>(`/stores/workbench/${id}`)
};

export const memberApi = {
  // 搜索可邀请的用户
  searchInvitable: (storeId: string, keyword: string) =>
    request<{ id: string; username: string; nickname: string | null; avatarUrl: string | null }[]>(
      `/stores/${storeId}/members/search?q=${encodeURIComponent(keyword)}`
    ),

  // 邀请成员
  invite: (storeId: string, userId: string, position: string) =>
    request<{ id: string }>(`/stores/${storeId}/members/invite`, {
      method: "POST",
      body: JSON.stringify({ userId, position })
    }),

  // 开除成员
  remove: (storeId: string, userId: string) =>
    request<{ success: boolean }>(`/stores/${storeId}/members/${userId}`, {
      method: "DELETE"
    }),

  // 查看我的邀请
  myInvitations: () =>
    request<{
      id: string; position: string; createdAt: string;
      store: { id: string; name: string };
      invitedBy: { id: string; username: string; nickname: string | null };
    }[]>("/invitations"),

  // 接受邀请
  accept: (id: string) =>
    request<{ success: boolean }>(`/invitations/${id}/accept`, { method: "POST" }),

  // 拒绝邀请
  reject: (id: string) =>
    request<{ success: boolean }>(`/invitations/${id}/reject`, { method: "POST" })
};

export type NotificationItem = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

export const notificationApi = {
  list: (page = 1, pageSize = 20) =>
    request<{ total: number; items: NotificationItem[] }>(
      `/notifications?page=${page}&pageSize=${pageSize}`
    ),

  unreadCount: () =>
    request<{ count: number }>("/notifications/unread-count"),

  markRead: (ids: string[]) =>
    request<{ success: boolean }>("/notifications/read", {
      method: "PATCH",
      body: JSON.stringify({ ids })
    }),

  markAllRead: () =>
    request<{ success: boolean }>("/notifications/read-all", { method: "PATCH" })
};

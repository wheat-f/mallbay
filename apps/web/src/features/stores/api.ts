import { request, requestMultipart } from "../../lib/request";

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

  getStore: (id: string) => request<StoreDetail>(`/stores/${id}`, { auth: false }),

  adminList: (params: { q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    const query = qs.toString();
    return request<{
      total: number;
      page: number;
      pageSize: number;
      items: {
        id: string;
        name: string;
        status: string;
        address: string | null;
        coverUrl: string | null;
        manager: { id: string; username: string; nickname: string | null } | null;
        createdAt: string;
      }[];
    }>(`/stores/admin/all${query ? `?${query}` : ""}`);
  },

  pendingSubmissions: () =>
    request<
      {
        id: string;
        name: string;
        address: string | null;
        description: string | null;
        status: string;
        createdAt: string;
        store: { id: string; name: string; status: string };
        submittedBy: { id: string; username: string; nickname: string | null };
      }[]
    >("/stores/admin/pending-submissions"),

  adminGetStore: (id: string) =>
    request<{
      id: string;
      name: string;
      status: string;
      address: string | null;
      description: string | null;
      createdAt: string;
      photos: { id: string; url: string; isCover: boolean; order: number }[];
      manager: { id: string; username: string; nickname: string | null; avatarUrl: string | null } | null;
      pendingSubmission: {
        id: string;
        name: string;
        address: string | null;
        description: string | null;
        createdAt: string;
        photos: { id: string; url: string; isCover: boolean; order: number }[];
        submittedBy: { id: string; username: string; nickname: string | null };
      } | null;
    }>(`/stores/admin/${id}`),

  reviewSubmission: (submissionId: string, payload: { action: "APPROVE" | "REJECT"; reviewNote?: string }) =>
    request<{ success: boolean }>(`/stores/submissions/${submissionId}/review`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  freeze: (id: string) =>
    request<{ success: boolean }>(`/stores/${id}/freeze`, { method: "PATCH" }),
  unfreeze: (id: string) =>
    request<{ success: boolean }>(`/stores/${id}/unfreeze`, { method: "PATCH" }),

  changeManager: (id: string, newManagerId: string) =>
    request<{ success: boolean }>(`/stores/${id}/manager`, {
      method: "PATCH",
      body: JSON.stringify({ newManagerId })
    }),

  uploadPhoto: (storeId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestMultipart<{ url: string }>(`/stores/${storeId}/photos/upload`, form);
  },

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

  myStore: (id: string) =>
    request<{
      id: string;
      name: string;
      status: string;
      address: string | null;
      description: string | null;
      photos: { id: string; url: string; isCover: boolean; order: number }[];
      members: {
        id: string;
        position: string;
        user: { id: string; username: string; nickname: string | null; avatarUrl: string | null };
      }[];
    }>(`/stores/workbench/${id}`)
};

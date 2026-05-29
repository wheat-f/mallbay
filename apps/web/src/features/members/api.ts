import { request } from "../../lib/request";

export const memberApi = {
  searchInvitable: (storeId: string, keyword: string) =>
    request<{ id: string; username: string; nickname: string | null; avatarUrl: string | null }[]>(
      `/stores/${storeId}/members/search?q=${encodeURIComponent(keyword)}`
    ),

  invite: (storeId: string, userId: string, position: string) =>
    request<{ id: string }>(`/stores/${storeId}/members/invite`, {
      method: "POST",
      body: JSON.stringify({ userId, position })
    }),

  remove: (storeId: string, userId: string) =>
    request<{ success: boolean }>(`/stores/${storeId}/members/${userId}`, {
      method: "DELETE"
    }),

  myInvitations: () =>
    request<
      {
        id: string;
        position: string;
        createdAt: string;
        store: { id: string; name: string };
        invitedBy: { id: string; username: string; nickname: string | null };
      }[]
    >("/invitations"),

  accept: (id: string) =>
    request<{ success: boolean }>(`/invitations/${id}/accept`, { method: "POST" }),

  reject: (id: string) =>
    request<{ success: boolean }>(`/invitations/${id}/reject`, { method: "POST" })
};

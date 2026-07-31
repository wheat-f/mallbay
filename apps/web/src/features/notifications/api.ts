import { request } from "../../lib/request";

export type NotificationItem = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  handledAt?: string | null;
  todoKey?: string | null;
  createdAt: string;
};

export const notificationApi = {
  list: (page = 1, pageSize = 20) =>
    request<{ total: number; items: NotificationItem[] }>(
      `/notifications?page=${page}&pageSize=${pageSize}`
    ),

  unreadCount: () => request<{ count: number }>("/notifications/unread-count"),

  listTodos: (page = 1, pageSize = 20) =>
    request<{ total: number; items: NotificationItem[] }>(`/notifications/todos?page=${page}&pageSize=${pageSize}`),

  markRead: (ids: string[]) =>
    request<{ success: boolean }>("/notifications/read", {
      method: "PATCH",
      body: JSON.stringify({ ids })
    }),

  markAllRead: () =>
    request<{ success: boolean }>("/notifications/read-all", { method: "PATCH" })
};

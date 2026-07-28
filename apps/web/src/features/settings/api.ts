import { request } from "../../lib/request";

export type DictionaryStatus = "ACTIVE" | "INACTIVE";
export type DictionarySource = "SYSTEM" | "HQ_TEMPLATE" | "STORE";
export type DictionaryItemEntry = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  status: DictionaryStatus;
  parentId?: string | null;
  source?: DictionarySource;
  disabledReason?: string | null;
  usageCount?: number;
  label?: string;
  isEnabled?: boolean;
};
export type DictionaryItem = {
  id: string;
  storeId: string;
  name: string;
  code: string;
  items: string[];
  source?: DictionarySource;
  version?: number;
  allowCustomItems?: boolean;
  allowDisableItems?: boolean;
  allowHierarchy?: boolean;
  dictionaryItems?: DictionaryItemEntry[];
  status: DictionaryStatus;
  createdAt: string;
  updatedAt: string;
};
export type DictionaryPayload = {
  storeId: string;
  name: string;
  code: string;
  items: string[];
  status?: DictionaryStatus;
  source?: DictionarySource;
  allowCustomItems?: boolean;
  allowDisableItems?: boolean;
  allowHierarchy?: boolean;
};

export const dictionaryApi = {
  list: (storeId: string) => request<DictionaryItem[]>(`/settings/dictionaries?storeId=${encodeURIComponent(storeId)}`),
  create: (payload: DictionaryPayload) => request<DictionaryItem>("/settings/dictionaries", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Omit<DictionaryPayload, "storeId" | "code">>) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  disable: (id: string) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "DELETE" }),
  listItems: (id: string) => request<DictionaryItemEntry[]>(`/settings/dictionaries/${id}/items`),
  createItem: (id: string, payload: { code: string; name: string; parentId?: string | null; sortOrder?: number }) => request<DictionaryItemEntry>(`/settings/dictionaries/${id}/items`, { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (itemId: string, payload: Record<string, unknown>) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  setItemStatus: (itemId: string, status: DictionaryStatus, reason?: string) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
  removeItem: (itemId: string) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}`, { method: "DELETE" })
};

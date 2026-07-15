import { request } from "../../lib/request";

export type DictionaryStatus = "ACTIVE" | "INACTIVE";

export type DictionaryItem = {
  id: string;
  storeId: string;
  name: string;
  code: string;
  items: string[];
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
};

export const dictionaryApi = {
  list: (storeId: string) => request<DictionaryItem[]>(`/settings/dictionaries?storeId=${encodeURIComponent(storeId)}`),
  create: (payload: DictionaryPayload) => request<DictionaryItem>("/settings/dictionaries", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Omit<DictionaryPayload, "storeId" | "code">>) =>
    request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  disable: (id: string) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "DELETE" })
};

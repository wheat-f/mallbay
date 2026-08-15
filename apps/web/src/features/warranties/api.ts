import type { WarrantySummary } from "@mallbay/shared";
import { request } from "../../lib/request";

export const warrantiesApi = {
  list: (storeId: string) =>
    request<WarrantySummary[]>(`/warranties${toQueryString({ storeId })}`),

  lookup: (warrantyNo: string) =>
    request<WarrantySummary>(`/warranties/lookup${toQueryString({ no: warrantyNo })}`, { auth: false }),

  detail: (id: string) =>
    request<WarrantySummary>(`/warranties/${id}`)
};

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

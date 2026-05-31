import type { CustomerSourceType, CustomerType, Gender } from "@mallbay/shared";
import { request } from "../../lib/request";

export type CreateCustomerPayload = {
  storeId: string;
  customerType: CustomerType;
  name?: string;
  gender?: Gender;
  birthday?: string;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  wechat?: string;
  sourceType?: CustomerSourceType;
  sourceDetail?: string;
  referrerId?: string;
};

export type CustomerListQuery = {
  storeId: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export const customerApi = {
  create: (payload: CreateCustomerPayload) =>
    request<unknown>("/customers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  list: (query: CustomerListQuery) =>
    request<{ items: unknown[]; total: number; page: number; pageSize: number }>(
      `/customers${toQueryString(query)}`
    ),

  detail: (id: string) => request<unknown>(`/customers/${id}`),

  update: (id: string, payload: Partial<CreateCustomerPayload>) =>
    request<unknown>(`/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  search: (storeId: string, q: string) =>
    request<unknown[]>(`/customers/search${toQueryString({ storeId, q })}`)
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

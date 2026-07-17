import type { ProductCategory, ProductStatus, ProductUnit } from "@mallbay/shared";
import { request } from "../../lib/request";

export type CreateProductPayload = {
  storeId: string;
  brand: string;
  name: string;
  model: string;
  category: ProductCategory;
  specification?: string;
  unit: ProductUnit;
  inventoryUnit?: ProductUnit;
  salesUnit?: ProductUnit;
  rollWidthMeters?: number;
  rollLengthMeters?: number;
  metersPerRoll?: number;
  quantityPrecision?: number;
  warrantyYears?: number;
  basePriceCents: number;
  standardCostCents?: number | null;
};

export type ProductUnitSuggestedPrice = {
  salesUnit: ProductUnit;
  suggestedPriceCents: number;
  isActive: boolean;
};

export type ProductListQuery = {
  storeId: string;
  q?: string;
  category?: ProductCategory;
  status?: ProductStatus;
  page?: number;
  pageSize?: number;
};

export const productApi = {
  create: (payload: CreateProductPayload) =>
    request<{ id: string }>("/products", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  list: (query: ProductListQuery) =>
    request<{ items: unknown[]; total: number; page: number; pageSize: number }>(
      `/products${toQueryString(query)}`
    ),

  detail: (id: string) => request<unknown>(`/products/${id}`),

  update: (id: string, payload: Partial<CreateProductPayload> & { status?: ProductStatus }) =>
    request<{ id: string }>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  updateStandardCost: (id: string, standardCostCents: number) =>
    request<unknown>(`/products/${id}/standard-cost`, {
      method: "PATCH",
      body: JSON.stringify({ standardCostCents })
    }),

  updateUnitSuggestedPrices: (id: string, prices: ProductUnitSuggestedPrice[]) =>
    request<unknown>(`/products/${id}/unit-suggested-prices`, {
      method: "PATCH",
      body: JSON.stringify({ prices })
    }),

  remove: (id: string) => request<unknown>(`/products/${id}`, { method: "DELETE" })
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

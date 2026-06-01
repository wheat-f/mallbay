import type { InventoryBatchSummary, ProductUnit } from "@mallbay/shared";
import { request } from "../../lib/request";

export type InventoryListQuery = {
  storeId: string;
  productId?: string;
};

export type CreateInventoryBatchPayload = {
  storeId: string;
  productId: string;
  batchNo: string;
  supplierName?: string;
  totalQuantity: number;
  unitCostCents?: number;
  productionDate?: string;
  receivedAt?: string;
};

export type CreatePurchaseOrderPayload = {
  storeId: string;
  supplierName?: string;
  expectedAt?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitCostCents?: number;
  }>;
};

export type ConvertBatchPayload = {
  fromUnit: ProductUnit;
  toUnit: ProductUnit;
  quantity: number;
  convertedQuantity: number;
};

export const inventoryApi = {
  batches: (query: InventoryListQuery) =>
    request<InventoryBatchSummary[]>(`/inventory/batches${toQueryString(query)}`),

  createBatch: (payload: CreateInventoryBatchPayload) =>
    request<InventoryBatchSummary>("/inventory/batches", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  convertBatch: (batchId: string, payload: ConvertBatchPayload) =>
    request<unknown>(`/inventory/batches/${batchId}/convert`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  movements: (query: InventoryListQuery) =>
    request<unknown[]>(`/inventory/movements${toQueryString(query)}`),

  purchaseOrders: (storeId: string) =>
    request<unknown[]>(`/inventory/purchase-orders${toQueryString({ storeId })}`),

  createPurchaseOrder: (payload: CreatePurchaseOrderPayload) =>
    request<unknown>("/inventory/purchase-orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  receivePurchaseItem: (id: string, payload: { quantity: number; batchNo: string; supplierName?: string }) =>
    request<unknown>(`/inventory/purchase-orders/items/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  lockOrder: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/lock`, { method: "POST" }),

  outboundOrder: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/outbound`, { method: "POST" })
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

import type { InventoryBatchSummary, InventoryMovementType, InventorySupplierSummary, ProductUnit } from "@mallbay/shared";
import { request } from "../../lib/request";

export type InventoryListQuery = {
  storeId: string;
  productId?: string;
  batchId?: string;
  orderId?: string;
  movementType?: InventoryMovementType;
  createdById?: string;
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

export type CreateSupplierPayload = {
  storeId: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  rating?: number;
  note?: string;
};

export type UpdateSupplierPayload = {
  name?: string;
  contactName?: string;
  contactPhone?: string;
  rating?: number;
  note?: string;
  isActive?: boolean;
};

export type CreateSupplierContactPayload = {
  name: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
};

export type CreateSupplierRatingHistoryPayload = {
  rating: number;
  note?: string;
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

export type CancelPurchaseOrderPayload = {
  reason: string;
};

export type ConvertBatchPayload = {
  fromUnit: ProductUnit;
  toUnit: ProductUnit;
  quantity: number;
  convertedQuantity: number;
};

export type CreatePurchaseRequirementPayload = {
  storeId: string;
  sourceOrderId?: string;
  items: Array<{
    productId: string;
    orderItemId?: string;
    requiredQuantity: number;
    requiredUnit: ProductUnit;
  }>;
};

export type CreatePurchaseOrderFromRequirementPayload = {
  supplierName?: string;
  expectedAt?: string;
};

export type SplitBatchPayload = {
  quantityMeters: number;
};

export type CreateStockOperationPayload = {
  batchId: string;
  movementType: InventoryMovementType;
  quantity: number;
  note?: string;
};

export type CreateOrderInventoryAllocationsPayload = {
  allocations: Array<{
    orderItemId: string;
    batchId: string;
    quantity: number;
  }>;
};

export type ReceivePurchaseItemPayload = {
  quantity: number;
  batchNo: string;
  supplierName?: string;
};

export type ReceivePurchaseItemBatchesResult = {
  received: Array<{ index: number; batchNo: string; batchId?: string }>;
  failed: Array<{ index: number; batchNo?: string; message: string }>;
};

export const inventoryApi = {
  batches: (query: InventoryListQuery) =>
    request<InventoryBatchSummary[]>(`/inventory/batches${toQueryString(query)}`),

  createBatch: (payload: CreateInventoryBatchPayload) =>
    request<InventoryBatchSummary>("/inventory/batches", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  suppliers: (storeId: string) =>
    request<InventorySupplierSummary[]>(`/inventory/suppliers${toQueryString({ storeId })}`),

  createSupplier: (payload: CreateSupplierPayload) =>
    request<InventorySupplierSummary>("/inventory/suppliers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateSupplier: (id: string, payload: UpdateSupplierPayload) =>
    request<InventorySupplierSummary>(`/inventory/suppliers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  createSupplierContact: (id: string, payload: CreateSupplierContactPayload) =>
    request<unknown>(`/inventory/suppliers/${id}/contacts`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createSupplierRatingHistory: (id: string, payload: CreateSupplierRatingHistoryPayload) =>
    request<unknown>(`/inventory/suppliers/${id}/rating-history`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  convertBatch: (batchId: string, payload: ConvertBatchPayload) =>
    request<unknown>(`/inventory/batches/${batchId}/convert`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  splitBatch: (batchId: string, payload: SplitBatchPayload) =>
    request<unknown>(`/inventory/batches/${batchId}/split`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  movements: (query: InventoryListQuery) =>
    request<unknown[]>(`/inventory/movements${toQueryString(query)}`),

  pendingMatchOrders: (storeId: string) =>
    request<unknown[]>(`/inventory/orders/pending-match${toQueryString({ storeId })}`),

  orderMatch: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/match`),

  createOrderAllocations: (orderId: string, payload: CreateOrderInventoryAllocationsPayload) =>
    request<unknown>(`/inventory/orders/${orderId}/allocations`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  purchaseOrders: (storeId: string) =>
    request<unknown[]>(`/inventory/purchase-orders${toQueryString({ storeId })}`),

  createPurchaseOrder: (payload: CreatePurchaseOrderPayload) =>
    request<unknown>("/inventory/purchase-orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  approvePurchaseOrder: (id: string) =>
    request<unknown>(`/inventory/purchase-orders/${id}/approve`, { method: "POST" }),

  cancelPurchaseOrder: (id: string, payload: CancelPurchaseOrderPayload) =>
    request<unknown>(`/inventory/purchase-orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  purchaseRequirements: (storeId: string) =>
    request<unknown[]>(`/inventory/purchase-requirements${toQueryString({ storeId })}`),

  createPurchaseRequirement: (payload: CreatePurchaseRequirementPayload) =>
    request<unknown>("/inventory/purchase-requirements", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createPurchaseOrderFromRequirement: (id: string, payload: CreatePurchaseOrderFromRequirementPayload) =>
    request<unknown>(`/inventory/purchase-requirements/${id}/purchase-orders`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  receivePurchaseItem: (id: string, payload: ReceivePurchaseItemPayload) =>
    request<unknown>(`/inventory/purchase-orders/items/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  receivePurchaseItemBatches: (id: string, payloads: ReceivePurchaseItemPayload[]) =>
    request<ReceivePurchaseItemBatchesResult>(`/inventory/purchase-orders/items/${id}/receive-batches`, {
      method: "POST",
      body: JSON.stringify({ batches: payloads })
    }),

  lockOrder: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/lock`, { method: "POST" }),

  outboundOrder: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/outbound`, { method: "POST" }),

  releaseOrder: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/release`, { method: "POST" }),

  createStockOperation: (payload: CreateStockOperationPayload) =>
    request<unknown>("/inventory/stock-operations", {
      method: "POST",
      body: JSON.stringify(payload)
    })
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

import type {
  InventoryBatchSummary,
  InventoryMovementType,
  InventorySupplierSummary,
  InventoryWarehouseSummary,
  ProductUnit
} from "@mallbay/shared";
import { request } from "../../lib/request";

export type InventoryListQuery = {
  storeId: string;
  productId?: string;
  batchId?: string;
  orderId?: string;
  movementType?: InventoryMovementType;
  createdById?: string;
  createdFrom?: string;
  createdTo?: string;
};

export type CreateInventoryBatchPayload = {
  storeId: string;
  productId: string;
  batchNo: string;
  supplierName?: string;
  totalQuantity: number;
  unit?: ProductUnit;
  baseUnit?: ProductUnit;
  baseQuantityPerPackage?: number;
  unitCostCents?: number;
  productionDate?: string;
  receivedAt?: string;
  warehouseId?: string;
  warehouseName?: string;
};

export type CreateWarehousePayload = {
  storeId: string;
  name: string;
  code?: string;
  area?: string;
  address?: string;
  isActive?: boolean;
};

export type UpdateWarehousePayload = {
  name?: string;
  code?: string;
  area?: string;
  address?: string;
  isActive?: boolean;
};

export type CreateSupplierPayload = {
  storeId: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  settlementCycle?: string;
  rating?: number;
  note?: string;
};

export type UpdateSupplierPayload = {
  name?: string;
  contactName?: string;
  contactPhone?: string;
  settlementCycle?: string;
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
  supplierAllocations?: Array<{
    supplierName: string;
    expectedAt?: string;
    items: Array<{
      purchaseRequirementItemId: string;
      quantity: number;
    }>;
  }>;
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
    unit?: ProductUnit;
  }>;
};

export type ReceivePurchaseItemPayload = {
  quantity: number;
  batchNo: string;
  unit?: ProductUnit;
  baseUnit?: ProductUnit;
  baseQuantityPerPackage?: number;
  supplierName?: string;
  warehouseId?: string;
  warehouseName?: string;
  /** 未传时沿用采购单计划价；传 null 表示待采购员后补实际入库价。 */
  actualUnitCostCents?: number | null;
  costDifferenceReason?: string;
};

export type UpdatePurchaseReceiptCostPayload = {
  actualUnitCostCents?: number | null;
  costDifferenceReason?: string;
};

export type OutboundOrderInventoryPayload = {
  lines: Array<{
    allocationId: string;
    quantity: number;
    unit: ProductUnit;
  }>;
};

export type ReceivePurchaseItemBatchesResult = {
  received: Array<{ index: number; batchNo: string; batchId?: string }>;
  failed: Array<{ index: number; batchNo?: string; message: string }>;
};

export type PurchaseOrderExportDimension = "supplier" | "product" | "date";

export type PurchaseOrderExportDetail = {
  purchaseOrderId: string;
  orderNo: string;
  supplierName: string;
  status: string;
  expectedAt?: string | null;
  createdAt: string;
  productId: string;
  productBrand: string;
  productName: string;
  productModel: string;
  productSpecification?: string | null;
  inventoryUnit?: ProductUnit | null;
  quantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  plannedUnitCostCents?: number | null;
  itemAmountCents?: number | null;
};

export const inventoryApi = {
  batches: (query: InventoryListQuery) =>
    request<InventoryBatchSummary[]>(`/inventory/batches${toQueryString(query)}`),

  createBatch: (payload: CreateInventoryBatchPayload) =>
    request<InventoryBatchSummary>("/inventory/batches", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  warehouses: (storeId: string) =>
    request<InventoryWarehouseSummary[]>(`/inventory/warehouses${toQueryString({ storeId })}`),

  createWarehouse: (payload: CreateWarehousePayload) =>
    request<InventoryWarehouseSummary>("/inventory/warehouses", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateWarehouse: (id: string, payload: UpdateWarehousePayload) =>
    request<InventoryWarehouseSummary>(`/inventory/warehouses/${id}`, {
      method: "PATCH",
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

  outboundOrder: (orderId: string, payload: OutboundOrderInventoryPayload) =>
    request<unknown>(`/inventory/orders/${orderId}/outbound`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  releaseOrder: (orderId: string) =>
    request<unknown>(`/inventory/orders/${orderId}/release`, { method: "POST" }),

  createStockOperation: (payload: CreateStockOperationPayload) =>
    request<unknown>("/inventory/stock-operations", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

export const purchaseApi = {
  overview: (storeId: string) =>
    request<unknown>(`/purchases/overview${toQueryString({ storeId })}`),

  requirements: (storeId: string) =>
    request<unknown[]>(`/purchases/requirements${toQueryString({ storeId })}`),

  createRequirement: (payload: CreatePurchaseRequirementPayload) =>
    request<unknown>("/purchases/requirements", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createPurchaseOrderFromRequirement: (id: string, payload: CreatePurchaseOrderFromRequirementPayload) =>
    request<unknown>(`/purchases/requirements/${id}/orders`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  orders: (storeId: string) =>
    request<unknown[]>(`/purchases/orders${toQueryString({ storeId })}`),

  exportOrderDetails: (storeId: string, exportDimension: PurchaseOrderExportDimension) =>
    request<PurchaseOrderExportDetail[]>(
      `/purchases/orders/export-details${toQueryString({ storeId, exportDimension })}`
    ),

  order: (id: string) =>
    request<unknown>(`/purchases/orders/${id}`),

  createOrder: (payload: CreatePurchaseOrderPayload) =>
    request<unknown>("/purchases/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  approveOrder: (id: string) =>
    request<unknown>(`/purchases/orders/${id}/approve`, { method: "POST" }),

  cancelOrder: (id: string, payload: CancelPurchaseOrderPayload) =>
    request<unknown>(`/purchases/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  receiveOrderItem: (id: string, payload: ReceivePurchaseItemPayload) =>
    request<unknown>(`/purchases/orders/items/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  receiveOrderItemBatches: (id: string, payloads: ReceivePurchaseItemPayload[]) =>
    request<ReceivePurchaseItemBatchesResult>(`/purchases/orders/items/${id}/receive-batches`, {
      method: "POST",
      body: JSON.stringify({ batches: payloads })
    }),

  updateReceiptCost: (id: string, payload: UpdatePurchaseReceiptCostPayload) =>
    request<unknown>(`/purchases/receipt-costs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  warehouses: (storeId: string) =>
    request<InventoryWarehouseSummary[]>(`/purchases/warehouses${toQueryString({ storeId })}`),

  suppliers: (storeId: string) =>
    request<InventorySupplierSummary[]>(`/purchases/suppliers${toQueryString({ storeId })}`),

  createSupplier: (payload: CreateSupplierPayload) =>
    request<InventorySupplierSummary>("/purchases/suppliers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateSupplier: (id: string, payload: UpdateSupplierPayload) =>
    request<InventorySupplierSummary>(`/purchases/suppliers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  createSupplierContact: (id: string, payload: CreateSupplierContactPayload) =>
    request<unknown>(`/purchases/suppliers/${id}/contacts`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createSupplierRatingHistory: (id: string, payload: CreateSupplierRatingHistoryPayload) =>
    request<unknown>(`/purchases/suppliers/${id}/rating-history`, {
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

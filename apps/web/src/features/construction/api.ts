import type {
  ConstructionPhotoStage,
  DailyCapacitySummary,
  OfflineSyncOperation,
  OfflineSyncResult,
  QualityCheckResult,
  ScheduleStatus,
  ScheduleSummary,
  WorkerSkillTag
} from "@mallbay/shared";
import { request, requestMultipart } from "../../lib/request";

export type CapacityPayload = {
  storeId: string;
  date: string;
  inStoreCapacity: number;
  outsideCapacity: number;
  heatFilmCapacity: number;
  inspectionCapacity: number;
};

export type ConstructionListQuery = {
  storeId: string;
  from?: string;
  to?: string;
};

export type AssignOrderPayload = {
  workerUserIds: string[];
};

export type UploadConstructionPhotoPayload = {
  stage: ConstructionPhotoStage;
  url?: string;
  takenAt?: string;
  file?: File;
};

export type QualityCheckPayload = {
  result: QualityCheckResult;
  note?: string;
};

export type WorkerProfilePayload = {
  storeId: string;
  userId: string;
  canWorkOutside?: boolean;
  skillTags?: WorkerSkillTag[];
  isActive?: boolean;
};

export type LeaveRequestPayload = {
  storeId: string;
  workerId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  reason?: string;
};

export type LeaveRequestSummary = {
  id: string;
  storeId: string;
  workerId: string;
  startDate: string;
  endDate: string;
  leaveType?: string | null;
  reason?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
  worker?: {
    id: string;
    username: string;
    nickname?: string | null;
    avatarUrl?: string | null;
  } | null;
  reviewedBy?: {
    id: string;
    username: string;
    nickname?: string | null;
  } | null;
};

export type SchedulePayload = {
  storeId: string;
  workerId: string;
  date: string;
  status: ScheduleStatus;
  note?: string;
};

export type OfflineSyncPayload = {
  operations: OfflineSyncOperation[];
};

export type ConstructionMaterialBatch = {
  allocationId: string;
  batchId: string;
  batchNo: string;
  supplierName?: string | null;
  unit: string;
  lockedQuantity: number;
  outboundQuantity: number;
  availableQuantity: number;
  status: string;
  verified: boolean;
  pickedUp: boolean;
};

export type ConstructionMaterialItem = {
  orderItemId: string;
  productId: string;
  productLabel: string;
  quantity: number;
  unit: string;
  requiredQuantity: number;
  allocatedQuantity: number;
  pickedQuantity: number;
  verifiedQuantity: number;
  batches: ConstructionMaterialBatch[];
};

export type ConstructionOrderMaterials = {
  order: {
    id: string;
    orderNo: string;
    status: string;
    constructionType: string;
    constructionLocation: string;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
  };
  summary: {
    requiredItems: number;
    allocatedBatches: number;
    verifiedBatches: number;
    pickedBatches: number;
    photoCount: number;
  };
  materials: ConstructionMaterialItem[];
};

export type ConstructionCostSettlement = {
  id: string;
  storeId: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "SETTLED";
  standardWorkMinutes: number;
  declaredWorkMinutes?: number | null;
  confirmedWorkMinutes: number;
  estimatedMaterialCostCents?: number | null;
  estimatedConstructionCostCents?: number | null;
  actualMaterialCostCents: number;
  actualConstructionCostCents: number;
  actualTotalCostCents: number;
  actualGrossProfitCents?: number | null;
  actualGrossMarginBps?: number | null;
  order?: { id: string; orderNo: string; vehicle?: { carPlate?: string | null; carModel?: string | null } | null };
  // Individual rates, commissions and allowances are returned only to finance/admin.
  workerLines: Array<{ workerUserId: string; standardMinutes: number; declaredMinutes?: number | null; confirmedMinutes: number; hourlyCostCentsSnapshot?: number; baseCostCents?: number; commissionCents?: number; allowanceCents?: number; manualConstructionChargeCents?: number | null; worker?: { realName?: string | null; username?: string | null } }>;
  adjustments: Array<{ id: string; adjustmentType: string; amountCents: number; reasonCode: string; reasonText?: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "SETTLED" }>;
  exceptions: Array<{ id: string; exceptionType: string; expectedCents: number; actualCents: number; varianceCents: number; status: string }>;
};

export type ConfirmCostSettlementPayload = {
  workerLines: Array<{ workerUserId: string; confirmedMinutes: number; commissionCents?: number; allowanceCents?: number; manualConstructionChargeCents?: number; varianceReasonCode?: string; varianceReasonText?: string }>;
};

export type WorkCostDeclaration = {
  id: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "SETTLED";
  standardMinutes: number;
  declaredMinutes?: number | null;
  varianceReasonCode?: string | null;
  varianceReasonText?: string | null;
};

export type CrossStoreTaskScope = "SOURCE" | "EXECUTION";

export type CrossStoreTaskStatus =
  | "PENDING_ACCEPTANCE"
  | "REJECTED"
  | "ACCEPTED"
  | "READY_TO_DISPATCH"
  | "DISPATCHED"
  | "IN_CONSTRUCTION"
  | "PENDING_SOURCE_ACCEPTANCE"
  | "COMPLETED"
  | "CANCELLED";
export type CrossStoreTask = {
  id: string;
  orderId: string;
  sourceStoreId: string;
  executionStoreId: string;
  status: CrossStoreTaskStatus;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  acceptanceRemark?: string | null;
  createdAt: string;
  updatedAt: string;
  sourceStore: { id: string; name: string };
  executionStore: { id: string; name: string };
  order: {
    id: string;
    orderNo: string;
    status: string;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    customer?: { id: string; name?: string | null; companyName?: string | null } | null;
    vehicle?: { id: string; carPlate?: string | null; carModel?: string | null } | null;
    amount?: { totalAmountCents: number; paidAmountCents: number; outstandingCents: number } | null;
  };
};

export type CrossStoreProductMapping = {
  id: string;
  sourceStoreId: string;
  executionStoreId: string;
  sourceProductId: string;
  executionProductId: string;
  sourceSalesUnit: string;
  executionInventoryUnit: string;
  conversionSnapshot?: Record<string, unknown> | null;
  sourceProduct: { id: string; brand: string; name: string; model: string };
  executionProduct: { id: string; brand: string; name: string; model: string };
  executionStore: { id: string; name: string };
};
export const constructionApi = {
  capacities: (query: ConstructionListQuery) =>
    request<DailyCapacitySummary[]>(`/construction/capacities${toQueryString(query)}`),

  upsertCapacity: (payload: CapacityPayload) =>
    request<DailyCapacitySummary>("/construction/capacities", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateCapacity: (id: string, payload: Partial<Omit<CapacityPayload, "storeId" | "date">>) =>
    request<DailyCapacitySummary>(`/construction/capacities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  assignments: (query: ConstructionListQuery) =>
    request<unknown[]>(`/construction/assignments${toQueryString(query)}`),

  assignOrder: (orderId: string, payload: AssignOrderPayload) =>
    request<unknown>(`/construction/orders/${orderId}/assign`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  startOrder: (orderId: string) =>
    request<unknown>(`/construction/orders/${orderId}/start`, { method: "POST" }),

  completeOrder: (orderId: string, completedAt?: string) =>
    request<unknown>(`/construction/orders/${orderId}/complete`, {
      method: "POST",
      body: JSON.stringify({ completedAt })
    }),

  uploadPhoto: (recordId: string, payload: UploadConstructionPhotoPayload) => {
    if (payload.file) {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("stage", payload.stage);
      if (payload.takenAt) formData.set("takenAt", payload.takenAt);
      return requestMultipart<unknown>(`/construction/records/${recordId}/photos`, formData);
    }
    return request<unknown>(`/construction/records/${recordId}/photos`, {
      method: "POST",
      body: JSON.stringify({
        stage: payload.stage,
        url: payload.url,
        takenAt: payload.takenAt
      })
    });
  },

  qualityCheck: (recordId: string, payload: QualityCheckPayload) =>
    request<unknown>(`/construction/records/${recordId}/quality-check`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  orderMaterials: (orderId: string) =>
    request<ConstructionOrderMaterials>(`/construction/orders/${orderId}/materials`),

  verifyMaterialBatch: (orderId: string, payload: { batchId: string; note?: string }) =>
    request<ConstructionOrderMaterials>(`/construction/orders/${orderId}/materials/verify-batch`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  pickupMaterials: (orderId: string, payload: { allocationIds: string[]; note?: string }) =>
    request<ConstructionOrderMaterials>(`/construction/orders/${orderId}/materials/pickup`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  recordMaterialLoss: (orderId: string, payload: { batchId: string; quantity: number; note?: string }) =>
    request<ConstructionOrderMaterials>(`/construction/orders/${orderId}/materials/losses`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  workers: (storeId: string) => request<unknown[]>(`/construction/workers${toQueryString({ storeId })}`),

  upsertWorker: (payload: WorkerProfilePayload) =>
    request<unknown>("/construction/workers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  leaves: (storeId: string) => request<LeaveRequestSummary[]>(`/construction/leaves${toQueryString({ storeId })}`),

  createLeave: (payload: LeaveRequestPayload) =>
    request<unknown>("/construction/leaves", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateLeave: (id: string, payload: { status: LeaveRequestSummary["status"]; reviewNote?: string }) =>
    request<LeaveRequestSummary>(`/construction/leaves/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  schedules: (query: ConstructionListQuery) =>
    request<ScheduleSummary[]>(`/construction/schedules${toQueryString(query)}`),

  upsertSchedule: (payload: SchedulePayload) =>
    request<ScheduleSummary>("/construction/schedules", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  offlineSync: (payload: OfflineSyncPayload) =>
    request<OfflineSyncResult>("/construction/offline-sync", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  costSettlements: (query: ConstructionListQuery & { status?: string }) =>
    request<ConstructionCostSettlement[]>(`/construction/cost-settlements${toQueryString(query)}`),

  confirmCostSettlement: (id: string, payload: ConfirmCostSettlementPayload) =>
    request<ConstructionCostSettlement>(`/construction/cost-settlements/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  workCostDeclaration: (recordId: string) =>
    request<WorkCostDeclaration>(`/construction/records/${recordId}/cost-declaration`),

  declareCostWork: (id: string, payload: { declaredWorkMinutes: number; varianceReasonCode?: string; varianceReasonText?: string }) =>
    request<WorkCostDeclaration>(`/construction/cost-settlements/${id}/declaration`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  batchConfirmCostSettlements: (settlementIds: string[]) =>
    request<ConstructionCostSettlement[]>("/construction/cost-settlements/batch-confirm", {
      method: "POST",
      body: JSON.stringify({ settlementIds })
    }),

  createCostAdjustment: (id: string, payload: { idempotencyKey: string; adjustmentType: string; amountCents: number; reasonCode: string; reasonText?: string }) =>
    request<ConstructionCostSettlement["adjustments"][number]>(`/construction/cost-settlements/${id}/adjustments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  approveCostAdjustment: (id: string, status: "APPROVED" | "REJECTED") =>
    request<ConstructionCostSettlement["adjustments"][number]>(`/construction/cost-adjustments/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ status })
    }),

  settleCostSettlement: (id: string) =>
    request<ConstructionCostSettlement>(`/construction/cost-settlements/${id}/settle`, { method: "POST" }),

  exportCostSettlements: (storeId: string) =>
    request<Array<Record<string, string | number | null>>>(`/construction/cost-settlements/export${toQueryString({ storeId })}`),

  crossStoreTasks: (query: { storeId: string; scope: CrossStoreTaskScope; status?: CrossStoreTaskStatus }) =>
    request<CrossStoreTask[]>(`/construction/cross-store/tasks${toQueryString(query)}`),

  crossStoreTask: (id: string) =>
    request<CrossStoreTask>(`/construction/cross-store/tasks/${id}`),

  acceptCrossStoreTask: (id: string) =>
    request<CrossStoreTask>(`/construction/cross-store/tasks/${id}/accept`, { method: "POST" }),

  rejectCrossStoreTask: (id: string, reason: string) =>
    request<CrossStoreTask>(`/construction/cross-store/tasks/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),

  cancelCrossStoreTask: (id: string, reason: string) =>
    request<CrossStoreTask>(`/construction/cross-store/tasks/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),

  submitCrossStoreAcceptance: (id: string, remark: string) =>
    request<CrossStoreTask>(`/construction/cross-store/tasks/${id}/submit-acceptance`, {
      method: "POST",
      body: JSON.stringify({ remark })
    }),

  acceptCrossStoreCompletion: (id: string) =>
    request<CrossStoreTask>(`/construction/cross-store/tasks/${id}/source-accept`, { method: "POST" }),

  crossStoreProductMappings: (sourceStoreId: string, executionStoreId: string) =>
    request<CrossStoreProductMapping[]>(
      `/construction/cross-store/product-mappings${toQueryString({ sourceStoreId, executionStoreId })}`
    ),

  upsertCrossStoreProductMapping: (payload: {
    sourceProductId: string;
    executionStoreId: string;
    executionProductId: string;
    sourceSalesUnit: string;
    executionInventoryUnit: string;
    conversionSnapshot?: Record<string, unknown>;
  }) =>
    request<CrossStoreProductMapping>("/construction/cross-store/product-mappings", {
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






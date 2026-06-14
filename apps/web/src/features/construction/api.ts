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
  reason?: string;
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

  workers: (storeId: string) => request<unknown[]>(`/construction/workers${toQueryString({ storeId })}`),

  upsertWorker: (payload: WorkerProfilePayload) =>
    request<unknown>("/construction/workers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  leaves: (storeId: string) => request<unknown[]>(`/construction/leaves${toQueryString({ storeId })}`),

  createLeave: (payload: LeaveRequestPayload) =>
    request<unknown>("/construction/leaves", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateLeave: (id: string, status: string) =>
    request<unknown>(`/construction/leaves/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
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

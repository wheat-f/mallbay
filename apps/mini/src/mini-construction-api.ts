import { DEFAULT_OFFLINE_QUEUE_MAX_RETRIES, type OfflineOperation } from "./offline-queue";
import type { CachedConstructionTask, ConstructionPhotoStage } from "./construction-task-view";
import { API_BASE_URL_KEY, AUTH_TOKEN_KEY, STORE_ID_KEY } from "./mini-auth-config";

export const TASK_CACHE_KEY = "mallbay_construction_tasks";
export const OFFLINE_QUEUE_KEY = "mallbay_offline_queue";
export const SCHEDULE_CACHE_KEY = "mallbay_construction_schedules";
export const MATERIAL_CACHE_KEY_PREFIX = "mallbay_construction_materials_";
export { API_BASE_URL_KEY, AUTH_TOKEN_KEY, STORE_ID_KEY };

export type MiniPlatform = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => unknown;
  request: (options: MiniRequestOptions) => Promise<unknown>;
  uploadFile: (options: MiniUploadFileOptions) => Promise<unknown>;
};

export type MiniRequestOptions = {
  url: string;
  method?: "GET" | "POST";
  header?: Record<string, string>;
  data?: unknown;
};

export type MiniUploadFileOptions = {
  url: string;
  filePath: string;
  name: string;
  header?: Record<string, string>;
  formData?: Record<string, string>;
};

export class MiniConstructionApi {
  constructor(private readonly platform: MiniPlatform) {}

  async pullAssignedTasks(input: { apiBaseUrl: string; token: string; storeId: string }) {
    const response = await this.platform.request({
      url: `${input.apiBaseUrl}/construction/assignments?storeId=${encodeURIComponent(input.storeId)}`,
      method: "GET",
      header: authHeader(input.token)
    });
    const tasks = normalizeAssignmentsResponse(response).map(toCachedConstructionTask);
    this.platform.setStorageSync(TASK_CACHE_KEY, tasks);
    return tasks;
  }

  async pullSchedules(input: { apiBaseUrl: string; token: string; storeId: string; from: string; to: string }) {
    const response = await this.platform.request({
      url: `${input.apiBaseUrl}/construction/schedules?storeId=${encodeURIComponent(input.storeId)}&from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}`,
      method: "GET",
      header: authHeader(input.token)
    });
    const schedules = normalizeListResponse(response);
    this.platform.setStorageSync(SCHEDULE_CACHE_KEY, mergeById(readArrayStorage(this.platform, SCHEDULE_CACHE_KEY), schedules));
    return schedules;
  }

  async pullOrderMaterials(input: { apiBaseUrl: string; token: string; orderId: string }) {
    const response = await this.platform.request({
      url: `${input.apiBaseUrl}/construction/orders/${encodeURIComponent(input.orderId)}/materials`,
      method: "GET",
      header: authHeader(input.token)
    });
    this.platform.setStorageSync(`${MATERIAL_CACHE_KEY_PREFIX}${input.orderId}`, response);
    return response;
  }

  async syncOfflineQueue(input: { apiBaseUrl: string; token: string }) {
    const items = readOfflineQueue(this.platform);
    const remaining: OfflineOperation[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of items.filter((operation) => operation.type === "PHOTO_UPLOAD" && operation.status !== "FAILED")) {
      try {
        await this.syncPhoto(input, item);
        synced += 1;
      } catch (error) {
        failed += 1;
        remaining.push(markFailed(item, error));
      }
    }

    const batchedOperations = items.filter((operation) => operation.type !== "PHOTO_UPLOAD" && operation.status !== "FAILED");
    if (batchedOperations.length > 0) {
      const response = await this.platform.request({
        url: `${input.apiBaseUrl}/construction/offline-sync`,
        method: "POST",
        header: {
          "Content-Type": "application/json",
          ...authHeader(input.token)
        },
        data: {
          operations: batchedOperations.map((item) => ({
            clientOperationId: item.id,
            type: item.type,
            payload: item.payload
          }))
        }
      });
      const syncedIds = new Set(normalizeOfflineSyncResponse(response)
        .filter((item) => item.status === "SYNCED")
        .map((item) => item.clientOperationId));
      for (const item of batchedOperations) {
        if (syncedIds.has(item.id)) {
          synced += 1;
        } else {
          failed += 1;
          remaining.push(markFailed(item, new Error("同步失败")));
        }
      }
    }

    remaining.push(...items.filter((operation) => operation.status === "FAILED"));
    this.platform.setStorageSync(OFFLINE_QUEUE_KEY, remaining);
    return { synced, failed, remaining: remaining.length };
  }

  private async syncPhoto(input: { apiBaseUrl: string; token: string }, item: OfflineOperation) {
    const payload = item.payload as { recordId?: string; stage?: ConstructionPhotoStage; localPath?: string; takenAt?: string };
    if (!payload.recordId || !payload.stage || !payload.localPath) {
      throw new Error("照片离线记录缺少 recordId、stage 或 localPath");
    }
    const formData: Record<string, string> = { stage: payload.stage };
    if (payload.takenAt) {
      formData.takenAt = payload.takenAt;
    }
    await this.platform.uploadFile({
      url: `${input.apiBaseUrl}/construction/records/${payload.recordId}/photos`,
      filePath: payload.localPath,
      name: "file",
      header: authHeader(input.token),
      formData
    });
  }
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function readOfflineQueue(platform: MiniPlatform): OfflineOperation[] {
  return readArrayStorage(platform, OFFLINE_QUEUE_KEY) as OfflineOperation[];
}

function markFailed(item: OfflineOperation, error: unknown): OfflineOperation {
  const attempts = item.attempts + 1;
  return {
    ...item,
    attempts,
    status: attempts >= DEFAULT_OFFLINE_QUEUE_MAX_RETRIES ? "FAILED" : "PENDING",
    lastError: error instanceof Error ? error.message : "同步失败"
  };
}

function normalizeAssignmentsResponse(response: unknown): unknown[] {
  return normalizeListResponse(response);
}

function normalizeOfflineSyncResponse(response: unknown) {
  if (response && typeof response === "object" && Array.isArray((response as { items?: unknown[] }).items)) {
    return (response as { items: { clientOperationId: string; status: string }[] }).items;
  }
  return [];
}

function normalizeListResponse(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object" && Array.isArray((response as { items?: unknown[] }).items)) {
    return (response as { items: unknown[] }).items;
  }
  return [];
}

function readArrayStorage(platform: MiniPlatform, key: string) {
  const value = platform.getStorageSync(key);
  return Array.isArray(value) ? value : [];
}

function mergeById(cached: unknown[], records: unknown[]) {
  const byId = new Map<string, unknown>();
  for (const item of cached) {
    const id = getRecordId(item);
    if (id) byId.set(id, item);
  }
  for (const item of records) {
    const id = getRecordId(item);
    if (id) byId.set(id, item);
  }
  return Array.from(byId.values());
}

function getRecordId(item: unknown) {
  if (!item || typeof item !== "object") return "";
  return String((item as { id?: unknown }).id ?? "");
}

function toCachedConstructionTask(record: unknown): CachedConstructionTask {
  const item = record as {
    id?: string;
    orderId?: string;
    status?: CachedConstructionTask["status"];
    order?: {
      orderNo?: string;
      constructionType?: string;
      constructionLocation?: string;
      appointmentDate?: string;
      appointmentTimeSlot?: string;
      outsideAddress?: string;
    };
    photos?: { stage?: ConstructionPhotoStage }[];
  };
  return {
    id: item.id ?? "",
    orderId: item.orderId ?? "",
    orderNo: item.order?.orderNo ?? item.orderId ?? "",
    customerName: "客户待同步",
    vehicleLabel: "车辆待同步",
    constructionType: getConstructionTypeLabel(item.order?.constructionType),
    constructionLocation: getConstructionLocationLabel(item.order?.constructionLocation),
    appointmentDate: formatDate(item.order?.appointmentDate),
    appointmentTimeSlot: item.order?.appointmentTimeSlot,
    outsideAddress: item.order?.outsideAddress,
    status: item.status ?? "DISPATCHED",
    photoStages: (item.photos ?? []).map((photo) => photo.stage).filter(Boolean) as ConstructionPhotoStage[]
  };
}

function getConstructionTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    PPF: "漆面保护膜",
    COLOR_FILM: "改色膜",
    HEAT_FILM: "玻璃膜",
    INSPECTION: "复检"
  };
  return value ? labels[value] ?? value : "施工类型待同步";
}

function getConstructionLocationLabel(value?: string) {
  const labels: Record<string, string> = {
    IN_STORE: "到店",
    OUTSIDE: "外出"
  };
  return value ? labels[value] ?? value : "施工地点待同步";
}

function formatDate(value?: string) {
  if (!value) return undefined;
  return value.slice(0, 10);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MATERIAL_CACHE_KEY_PREFIX,
  OFFLINE_QUEUE_KEY,
  SCHEDULE_CACHE_KEY,
  TASK_CACHE_KEY,
  MiniConstructionApi,
  type MiniPlatform
} from "./mini-construction-api";

test("MiniConstructionApi pulls assigned construction tasks into local cache", async () => {
  const calls: unknown[] = [];
  const storage = new Map<string, unknown>();
  const api = new MiniConstructionApi(createPlatform(storage, calls, {
    items: [
      {
        id: "record-1",
        orderId: "order-1",
        status: "DISPATCHED",
        order: {
          orderNo: "MB20260606001",
          constructionType: "PPF",
          constructionLocation: "IN_STORE",
          appointmentDate: "2026-06-18T00:00:00.000Z",
          appointmentTimeSlot: "09:00",
          customer: { name: "申周翰" },
          vehicle: { plateNo: "湘A101ZQ", brand: "宝马", model: "5系", color: "黑色" }
        },
        photos: [{ stage: "BEFORE" }]
      }
    ]
  }));

  const tasks = await api.pullAssignedTasks({
    apiBaseUrl: "http://localhost:3001",
    token: "token-1",
    storeId: "store-1"
  });

  assert.equal((calls[0] as { url: string }).url, "http://localhost:3001/construction/assignments?storeId=store-1");
  assert.deepEqual((calls[0] as { header: Record<string, string> }).header, { Authorization: "Bearer token-1" });
  assert.deepEqual(tasks, [
    {
      id: "record-1",
      orderId: "order-1",
      orderNo: "MB20260606001",
      customerName: "申周翰",
      vehicleLabel: "湘A101ZQ / 宝马 / 5系 / 黑色",
      constructionType: "漆面保护膜",
      constructionLocation: "到店",
      appointmentDate: "2026-06-18",
      appointmentTimeSlot: "09:00",
      outsideAddress: undefined,
      status: "DISPATCHED",
      photoStages: ["BEFORE"]
    }
  ]);
  assert.deepEqual(storage.get(TASK_CACHE_KEY), tasks);
});

test("MiniConstructionApi syncs local photo uploads and batched status operations", async () => {
  const calls: unknown[] = [];
  const storage = new Map<string, unknown>([
    [
      OFFLINE_QUEUE_KEY,
      [
        {
          id: "op-photo",
          type: "PHOTO_UPLOAD",
          payload: {
            recordId: "record-1",
            stage: "AFTER",
            localPath: "wxfile://tmp/after.jpg",
            takenAt: "2026-06-18T09:05:00.000Z"
          },
          attempts: 0,
          status: "PENDING",
          createdAt: "2026-06-18T09:00:00.000Z"
        },
        {
          id: "op-status",
          type: "TASK_STATUS",
          payload: { orderId: "order-1", status: "COMPLETED", completedAt: "2026-06-18T10:00:00.000Z" },
          attempts: 0,
          status: "PENDING",
          createdAt: "2026-06-18T09:10:00.000Z"
        }
      ]
    ]
  ]);
  const api = new MiniConstructionApi(createPlatform(storage, calls, {
    items: [{ clientOperationId: "op-status", status: "SYNCED" }]
  }));

  const result = await api.syncOfflineQueue({ apiBaseUrl: "http://localhost:3001", token: "token-1" });

  assert.deepEqual(result, { synced: 2, failed: 0, remaining: 0 });
  assert.equal((calls[0] as { kind: string }).kind, "uploadFile");
  assert.equal((calls[0] as { url: string }).url, "http://localhost:3001/construction/records/record-1/photos");
  assert.deepEqual((calls[0] as { formData: Record<string, string> }).formData, {
    stage: "AFTER",
    takenAt: "2026-06-18T09:05:00.000Z"
  });
  assert.equal((calls[1] as { kind: string }).kind, "request");
  assert.equal((calls[1] as { url: string }).url, "http://localhost:3001/construction/offline-sync");
  assert.deepEqual((calls[1] as { data: unknown }).data, {
    operations: [
      {
        clientOperationId: "op-status",
        type: "TASK_STATUS",
        payload: { orderId: "order-1", status: "COMPLETED", completedAt: "2026-06-18T10:00:00.000Z" }
      }
    ]
  });
  assert.deepEqual(storage.get(OFFLINE_QUEUE_KEY), []);
});

test("MiniConstructionApi pulls schedules into local cache", async () => {
  const calls: unknown[] = [];
  const storage = new Map<string, unknown>();
  const api = new MiniConstructionApi(createPlatform(storage, calls, [
    { id: "schedule-1", date: "2026-06-21T00:00:00.000Z", status: "WORKING" }
  ]));

  const schedules = await api.pullSchedules({
    apiBaseUrl: "http://localhost:3001",
    token: "token-1",
    storeId: "store-1",
    from: "2026-06-21",
    to: "2026-06-21"
  });

  assert.equal(
    (calls[0] as { url: string }).url,
    "http://localhost:3001/construction/schedules?storeId=store-1&from=2026-06-21&to=2026-06-21"
  );
  assert.deepEqual(schedules, [{ id: "schedule-1", date: "2026-06-21T00:00:00.000Z", status: "WORKING" }]);
  assert.deepEqual(storage.get(SCHEDULE_CACHE_KEY), schedules);
});

test("MiniConstructionApi pulls order materials into per-order cache", async () => {
  const calls: unknown[] = [];
  const storage = new Map<string, unknown>();
  const response = {
    order: { id: "order-1", orderNo: "ORD20260621001" },
    summary: { requiredItems: 1, allocatedBatches: 1, verifiedBatches: 0, pickedBatches: 0, photoCount: 0 },
    materials: []
  };
  const api = new MiniConstructionApi(createPlatform(storage, calls, response));

  const materials = await api.pullOrderMaterials({
    apiBaseUrl: "http://localhost:3001",
    token: "token-1",
    orderId: "order-1"
  });

  assert.equal((calls[0] as { url: string }).url, "http://localhost:3001/construction/orders/order-1/materials");
  assert.deepEqual(materials, response);
  assert.deepEqual(storage.get(`${MATERIAL_CACHE_KEY_PREFIX}order-1`), response);
});

test("MiniConstructionApi retries failed offline operations three times before marking failed", async () => {
  const calls: unknown[] = [];
  const storage = new Map<string, unknown>([
    [
      OFFLINE_QUEUE_KEY,
      [
        {
          id: "op-photo",
          type: "PHOTO_UPLOAD",
          payload: { recordId: "record-1", stage: "AFTER", localPath: "wxfile://tmp/after.jpg" },
          attempts: 0,
          status: "PENDING",
          createdAt: "2026-06-18T09:00:00.000Z"
        },
        {
          id: "op-status",
          type: "TASK_STATUS",
          payload: { orderId: "order-1", status: "COMPLETED" },
          attempts: 2,
          status: "PENDING",
          createdAt: "2026-06-18T09:10:00.000Z"
        }
      ]
    ]
  ]);
  const api = new MiniConstructionApi(createPlatform(storage, calls, { items: [] }, { uploadFails: true }));

  const result = await api.syncOfflineQueue({ apiBaseUrl: "http://localhost:3001", token: "token-1" });

  assert.deepEqual(result, { synced: 0, failed: 2, remaining: 2 });
  assert.deepEqual(storage.get(OFFLINE_QUEUE_KEY), [
    {
      id: "op-photo",
      type: "PHOTO_UPLOAD",
      payload: { recordId: "record-1", stage: "AFTER", localPath: "wxfile://tmp/after.jpg" },
      attempts: 1,
      status: "PENDING",
      createdAt: "2026-06-18T09:00:00.000Z",
      lastError: "upload failed"
    },
    {
      id: "op-status",
      type: "TASK_STATUS",
      payload: { orderId: "order-1", status: "COMPLETED" },
      attempts: 3,
      status: "FAILED",
      createdAt: "2026-06-18T09:10:00.000Z",
      lastError: "同步失败"
    }
  ]);
});

function createPlatform(
  storage: Map<string, unknown>,
  calls: unknown[],
  response: unknown,
  behavior: { uploadFails?: boolean } = {}
): MiniPlatform {
  return {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    request: async (options) => {
      calls.push({ kind: "request", ...options });
      return response;
    },
    uploadFile: async (uploadOptions) => {
      calls.push({ kind: "uploadFile", ...uploadOptions });
      if (behavior.uploadFails) {
        throw new Error("upload failed");
      }
      return { ok: true };
    }
  };
}

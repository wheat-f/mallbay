import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_BASE_URL_KEY,
  AUTH_TOKEN_KEY,
  STORE_ID_KEY
} from "./mini-auth-config";
import {
  AUTO_SYNC_INTERVAL_MS,
  AUTO_SYNC_LAST_AT_KEY,
  runMiniAutoSync
} from "./mini-auto-sync";
import { OFFLINE_QUEUE_KEY, type MiniPlatform } from "./mini-construction-api";

test("runMiniAutoSync skips when runtime config or offline queue is missing", async () => {
  const storage = new Map<string, unknown>();
  const calls: unknown[] = [];

  assert.deepEqual(await runMiniAutoSync(createPlatform(storage, calls), { nowMs: 1000 }), {
    status: "SKIPPED",
    reason: "MISSING_CONFIG"
  });

  storage.set(API_BASE_URL_KEY, "http://localhost:3001");
  storage.set(AUTH_TOKEN_KEY, "token-1");
  storage.set(STORE_ID_KEY, "store-1");

  assert.deepEqual(await runMiniAutoSync(createPlatform(storage, calls), { nowMs: 1000 }), {
    status: "SKIPPED",
    reason: "EMPTY_QUEUE"
  });
  assert.deepEqual(calls, []);
});

test("runMiniAutoSync respects the minimum interval", async () => {
  const storage = createConfiguredStorage();
  storage.set(OFFLINE_QUEUE_KEY, [
    { id: "op-1", type: "TASK_STATUS", payload: { orderId: "order-1", status: "COMPLETED" }, attempts: 0, status: "PENDING", createdAt: "2026-06-18T09:00:00.000Z" }
  ]);
  storage.set(AUTO_SYNC_LAST_AT_KEY, 10_000);

  assert.deepEqual(await runMiniAutoSync(createPlatform(storage, []), { nowMs: 10_000 + AUTO_SYNC_INTERVAL_MS - 1 }), {
    status: "SKIPPED",
    reason: "TOO_SOON"
  });
});

test("runMiniAutoSync syncs queue and records last sync time", async () => {
  const storage = createConfiguredStorage();
  const calls: unknown[] = [];
  storage.set(OFFLINE_QUEUE_KEY, [
    { id: "op-1", type: "TASK_STATUS", payload: { orderId: "order-1", status: "COMPLETED" }, attempts: 0, status: "PENDING", createdAt: "2026-06-18T09:00:00.000Z" }
  ]);

  const result = await runMiniAutoSync(createPlatform(storage, calls), { nowMs: 20_000 });

  assert.deepEqual(result, { status: "SYNCED", synced: 1, failed: 0, remaining: 0 });
  assert.equal(storage.get(AUTO_SYNC_LAST_AT_KEY), 20_000);
  assert.equal((calls[0] as { url: string }).url, "http://localhost:3001/construction/offline-sync");
});

function createConfiguredStorage() {
  return new Map<string, unknown>([
    [API_BASE_URL_KEY, "http://localhost:3001"],
    [AUTH_TOKEN_KEY, "token-1"],
    [STORE_ID_KEY, "store-1"]
  ]);
}

function createPlatform(storage: Map<string, unknown>, calls: unknown[]): MiniPlatform {
  return {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    request: async (options) => {
      calls.push(options);
      return { items: [{ clientOperationId: "op-1", status: "SYNCED" }] };
    },
    uploadFile: async (options) => {
      calls.push(options);
      return { ok: true };
    }
  };
}

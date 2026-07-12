import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineQueue, MemoryOfflineStorage } from "./offline-queue";

test("OfflineQueue rejects new tasks when cached task limit is reached", async () => {
  const queue = new OfflineQueue(new MemoryOfflineStorage(), { maxItems: 2, maxRetries: 3 });
  await queue.enqueue({ type: "TASK_STATUS", payload: { orderId: "order-1", status: "IN_CONSTRUCTION" } });
  await queue.enqueue({ type: "PHOTO_UPLOAD", payload: { recordId: "record-1", stage: "BEFORE", localPath: "/tmp/a.jpg" } });

  await assert.rejects(
    queue.enqueue({ type: "LEAVE_REQUEST", payload: { storeId: "store-1", startDate: "2026-06-02", endDate: "2026-06-02" } }),
    /本地缓存已达上限/
  );
});

test("OfflineQueue retries failed uploads three times before marking failed", async () => {
  const queue = new OfflineQueue(new MemoryOfflineStorage(), { maxItems: 10, maxRetries: 3 });
  const item = await queue.enqueue({
    type: "PHOTO_UPLOAD",
    payload: { recordId: "record-1", stage: "AFTER", localPath: "/tmp/after.jpg" }
  });
  let attempts = 0;

  await queue.flush(async () => {
    attempts += 1;
    throw new Error("offline");
  });
  await queue.flush(async () => {
    attempts += 1;
    throw new Error("offline");
  });
  await queue.flush(async () => {
    attempts += 1;
    throw new Error("offline");
  });

  const items = await queue.list();
  assert.equal(attempts, 3);
  assert.equal(items.find((entry) => entry.id === item.id)?.status, "FAILED");
});

test("OfflineQueue removes synced items after successful flush", async () => {
  const queue = new OfflineQueue(new MemoryOfflineStorage(), { maxItems: 10, maxRetries: 3 });
  await queue.enqueue({ type: "TASK_STATUS", payload: { orderId: "order-1", status: "COMPLETED" } });

  await queue.flush(async () => ({ ok: true }));

  assert.deepEqual(await queue.list(), []);
});

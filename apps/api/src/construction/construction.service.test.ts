import assert from "node:assert/strict";
import { test } from "node:test";
import { ConstructionPhotoStage, ConstructionTaskStatus, ProductUnit, StorePosition } from "@prisma/client";
import { ConstructionService } from "./construction.service";

const access = {
  can: async (_actor: { userId: string }, capability: string, action: string) => capability === "construction" && (action === "read" || action === "write"),
  scope: async (actor: { userId: string }, capability: string, action: string) => ({
    allowed: capability === "construction" || capability === "orders" || capability === "after-sales",
    global: false,
    storeIds: ["store-1"],
    ...((capability === "orders" && action === "read") ? { ownerId: actor.userId } : {})
  }),
  resolve: async () => ({ roles: [{ roleCode: "CONSTRUCTION" }] })
};

test("ConstructionService keeps assignment listing as a read adapter", async () => {
  const calls: unknown[] = [];
  const service = new ConstructionService({
    storeMember: { findUnique: async () => null },
    constructionRecord: { findMany: async (args: unknown) => { calls.push(args); return []; } }
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never);
  await service.listAssignments({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } }, { storeId: "store-1" });
  assert.deepEqual((calls[0] as { where: unknown }).where, { storeId: "store-1", order: { salesPersonId: "sales-1" } });
});

test("ConstructionService keeps evidence upload outside the order state seam", async () => {
  const writes: unknown[] = [];
  const service = new ConstructionService({
    storeMember: { findUnique: async () => null },
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: { create: async (args: unknown) => { writes.push(args); return { id: "photo-1" }; } }
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never);
  const result = await service.uploadPhoto({ id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } }, "record-1", { stage: ConstructionPhotoStage.BEFORE, url: "https://oss.example/photo.jpg" });
  assert.deepEqual(result, { id: "photo-1" });
  assert.equal(JSON.stringify(writes).includes("https://oss.example/photo.jpg"), true);
});

test("ConstructionService cleans up a newly uploaded object when evidence persistence fails", async () => {
  let removedUrl: string | undefined;
  const uploadedUrl = "http://localhost:4001/local-oss/construction/store-1/order-1/photo-op-rollback.jpg";
  const service = new ConstructionService({
    storeMember: { findUnique: async () => null },
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: {
      findUnique: async () => null,
      create: async () => { throw new Error("database write failed"); }
    }
  } as never, {} as never, {
    uploadConstructionPhoto: async () => uploadedUrl,
    removeConstructionPhoto: async (url: string) => { removedUrl = url; }
  } as never, undefined, undefined, undefined, access as never);

  await assert.rejects(
    service.uploadPhoto(
      { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } },
      "record-1",
      { stage: ConstructionPhotoStage.BEFORE },
      { originalname: "photo.jpg", mimetype: "image/jpeg", buffer: Buffer.from("photo") } as never,
      "photo-op-rollback"
    ),
    /database write failed/
  );
  assert.equal(removedUrl, uploadedUrl);
});

test("ConstructionService enforces evidence stage and replays offline photo commands", async () => {
  let createCount = 0;
  const existing = { id: "photo-1", recordId: "record-1", clientOperationId: "photo-op-1" };
  const service = new ConstructionService({
    storeMember: { findUnique: async () => null },
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", status: ConstructionTaskStatus.DISPATCHED, assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: {
      findUnique: async ({ where }: { where: { clientOperationId?: string } }) => where.clientOperationId === "photo-op-1" ? existing : null,
      create: async () => { createCount += 1; return existing; }
    }
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never);
  await assert.rejects(
    service.uploadPhoto({ id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } }, "record-1", { stage: ConstructionPhotoStage.AFTER, url: "https://oss.example/photo.jpg" }),
    (error: { response?: { code?: string } }) => error.response?.code === "EVIDENCE_STAGE_NOT_ALLOWED"
  );
  const replay = await service.uploadPhoto({ id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } }, "record-1", { stage: ConstructionPhotoStage.BEFORE, url: "https://oss.example/photo.jpg" }, undefined, "photo-op-1");
  assert.deepEqual(replay, { id: "photo-1", recordId: "record-1" });
  assert.equal(JSON.stringify(replay).includes("clientOperationId"), false);
  assert.equal(JSON.stringify(replay).includes("requestFingerprint"), false);
  assert.equal(createCount, 0);
});

test("ConstructionService persists evidence fingerprint/status and rejects conflicting replay input", async () => {
  const writes: Array<{ data: Record<string, unknown> }> = [];
  let existing: Record<string, unknown> | null = null;
  const service = new ConstructionService({
    storeMember: { findUnique: async () => null },
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", status: ConstructionTaskStatus.IN_CONSTRUCTION, assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: {
      findUnique: async () => existing,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data });
        existing = { id: "photo-1", ...data };
        return existing;
      }
    }
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never);

  const first = await service.uploadPhoto(
    { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } },
    "record-1",
    { stage: ConstructionPhotoStage.BEFORE, purpose: "FILM_BOX", url: "https://oss.example/photo.jpg" },
    undefined,
    "photo-op-fingerprint"
  );
  assert.equal((first as { status: string }).status, "APPLIED");
  assert.equal((first as { purpose: string }).purpose, "FILM_BOX");
  assert.equal(writes[0]?.data.purpose, "FILM_BOX");
  assert.match(String(writes[0]?.data.requestFingerprint), /^[a-f0-9]{64}$/);

  await assert.rejects(
    service.uploadPhoto(
      { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } },
      "record-1",
      { stage: ConstructionPhotoStage.BEFORE, url: "https://oss.example/different.jpg" },
      undefined,
      "photo-op-fingerprint"
    ),
    (error: { response?: { code?: string } }) => error.response?.code === "COMMAND_ID_CONFLICT"
  );
});

test("ConstructionService deletes a worker photo and stored object before completion", async () => {
  const calls: string[] = [];
  const service = new ConstructionService({
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", status: ConstructionTaskStatus.IN_CONSTRUCTION, assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: {
      findFirst: async () => ({ id: "photo-1", recordId: "record-1", url: "https://files.test/photo.jpg" }),
      delete: async () => { calls.push("delete-row"); }
    },
    warrantyPhoto: { count: async () => 0 }
  } as never, {} as never, {
    removeConstructionPhoto: async (url: string) => { calls.push(`delete-file:${url}`); }
  } as never, undefined, undefined, undefined, access as never);
  const result = await service.deletePhoto(
    { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } },
    "record-1",
    "photo-1"
  );
  assert.deepEqual(result, { id: "photo-1", deleted: true });
  assert.deepEqual(calls, ["delete-row", "delete-file:https://files.test/photo.jpg"]);
});

test("ConstructionService revokes a photo as audited evidence without deleting its record", async () => {
  const auditWrites: unknown[] = [];
  let savedStatus = "APPLIED";
  const tx = {
    constructionPhoto: {
      updateMany: async ({ data }: { data: { status: string } }) => {
        savedStatus = data.status;
        return { count: 1 };
      }
    },
    auditEvent: { create: async (args: unknown) => { auditWrites.push(args); } }
  };
  const service = new ConstructionService({
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", status: ConstructionTaskStatus.IN_CONSTRUCTION, assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: { findFirst: async () => ({ id: "photo-1", recordId: "record-1", status: "APPLIED", stage: ConstructionPhotoStage.AFTER, url: "https://oss.example/photo.jpg", uploadedById: "worker-1" }) },
    warrantyPhoto: { count: async () => 0 },
    $transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => run(tx)
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never);

  const result = await service.revokePhoto(
    { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } },
    "record-1",
    "photo-1",
    { reason: "照片拍摄角度不正确" }
  );
  assert.equal(savedStatus, "REVOKED");
  assert.equal((result as { status: string }).status, "REVOKED");
  assert.equal(auditWrites.length, 1);
  assert.equal(JSON.stringify(auditWrites[0]).includes("照片拍摄角度不正确"), true);
});

test("ConstructionService refuses to revoke a photo already used in a warranty", async () => {
  const service = new ConstructionService({
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", status: ConstructionTaskStatus.IN_CONSTRUCTION, assignments: [{ workerUserId: "worker-1" }] }) },
    constructionPhoto: { findFirst: async () => ({ id: "photo-1", recordId: "record-1", status: "APPLIED", stage: ConstructionPhotoStage.AFTER, url: "https://oss.example/photo.jpg", uploadedById: "worker-1" }) },
    warrantyPhoto: { count: async () => 1 }
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never);
  await assert.rejects(
    service.revokePhoto(
      { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } },
      "record-1",
      "photo-1",
      { reason: "替换错误照片" }
    ),
    /已归档到质保凭证/
  );
});

test("ConstructionService persists material pickup idempotently and invalidates the order version", async () => {
  const writes: unknown[] = [];
  const tx = {
    inventoryMovement: {
      createMany: async (args: unknown) => { writes.push(args); return { count: 1 }; }
    },
    order: { findUnique: async () => ({ lifecycleVersion: 3 }), updateMany: async () => ({ count: 1 }) },
    orderLifecycleVersionChange: { create: async (args: unknown) => { writes.push(args); } },
    orderInventoryAllocation: { findMany: async () => [] }
  };
  const service = new ConstructionService({
    storeMember: { findUnique: async () => null },
    constructionRecord: { findUnique: async () => ({ id: "record-1", storeId: "store-1", orderId: "order-1", assignments: [{ workerUserId: "worker-1" }], photos: [] }) },
    orderInventoryAllocation: { findMany: async () => [{ id: "allocation-1", storeId: "store-1", batchId: "batch-1", productId: "product-1", batch: { unit: ProductUnit.ROLL, batchNo: "B-1" } }] },
    inventoryMovement: { findMany: async () => [], createMany: async () => ({ count: 1 }) },
    order: { findUnique: async () => ({ id: "order-1", orderNo: "ORD-1", status: ConstructionTaskStatus.IN_CONSTRUCTION, constructionType: "PPF", constructionLocation: "IN_STORE", appointmentDate: null, appointmentTimeSlot: null, items: [], inventoryMovements: [] }) },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  } as never, {} as never, undefined, undefined, undefined, undefined, access as never, {
    pickupMaterialsWithin: async () => { writes.push("ledger"); return { count: 1 }; }
  } as never);
  await service.pickupMaterials({ id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION } }, "order-1", { allocationIds: ["allocation-1"] });
  assert.equal(writes.length, 2);
});

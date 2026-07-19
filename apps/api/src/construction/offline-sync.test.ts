import { test } from "node:test";
import assert from "node:assert/strict";
import { ConstructionPhotoStage, ConstructionTaskStatus } from "@prisma/client";
import { ConstructionService, type AuthenticatedConstructionUser } from "./construction.service";

test("ConstructionService syncs offline photo status and leave operations in order", async () => {
  const service = new ConstructionService({} as never);
  const calls: string[] = [];
  const user: AuthenticatedConstructionUser = {
    id: "worker-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "CONSTRUCTION" }
  };

  service.uploadPhoto = async (_user, recordId, dto) => {
    calls.push(`photo:${recordId}:${dto.stage}`);
    return { id: "photo-1" };
  };
  service.startOrder = async (_user, orderId, dto) => {
    calls.push(`start:${orderId}:${dto?.startedAt}`);
    return { id: "record-1" };
  };
  service.completeOrderForOrder = async (_user, orderId) => {
    calls.push(`complete:${orderId}`);
    return { id: "record-1" };
  };
  service.createLeave = async (_user, dto) => {
    calls.push(`leave:${dto.workerId}:${dto.startDate}`);
    return { id: "leave-1" };
  };

  const result = await service.syncOfflineOperations(user, {
    operations: [
      {
        clientOperationId: "op-photo",
        type: "PHOTO_UPLOAD",
        payload: { recordId: "record-1", stage: ConstructionPhotoStage.BEFORE, url: "https://oss/photo.jpg" }
      },
      {
        clientOperationId: "op-start",
        type: "TASK_STATUS",
        payload: {
          orderId: "order-1",
          status: ConstructionTaskStatus.IN_CONSTRUCTION,
          startedAt: "2026-06-02T07:00:00.000Z"
        }
      },
      {
        clientOperationId: "op-complete",
        type: "TASK_STATUS",
        payload: { orderId: "order-1", status: ConstructionTaskStatus.COMPLETED, completedAt: "2026-06-02T08:00:00.000Z" }
      },
      {
        clientOperationId: "op-leave",
        type: "LEAVE_REQUEST",
        payload: {
          storeId: "store-1",
          workerId: "worker-1",
          startDate: "2026-06-03T00:00:00.000Z",
          endDate: "2026-06-03T23:59:59.000Z",
          leaveType: "PERSONAL",
          reason: "事假"
        }
      }
    ]
  });

  assert.deepEqual(calls, [
    "photo:record-1:BEFORE",
    "start:order-1:2026-06-02T07:00:00.000Z",
    "complete:order-1",
    "leave:worker-1:2026-06-03T00:00:00.000Z"
  ]);
  assert.deepEqual(
    result.items.map((item) => [item.clientOperationId, item.status]),
    [
      ["op-photo", "SYNCED"],
      ["op-start", "SYNCED"],
      ["op-complete", "SYNCED"],
      ["op-leave", "SYNCED"]
    ]
  );
});

test("ConstructionService marks failed offline operations without stopping later operations", async () => {
  const service = new ConstructionService({} as never);
  const user: AuthenticatedConstructionUser = {
    id: "worker-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "CONSTRUCTION" }
  };
  service.uploadPhoto = async () => {
    throw new Error("OSS unavailable");
  };
  service.createLeave = async () => ({ id: "leave-1" });

  const result = await service.syncOfflineOperations(user, {
    operations: [
      {
        clientOperationId: "op-photo",
        type: "PHOTO_UPLOAD",
        payload: { recordId: "record-1", stage: ConstructionPhotoStage.AFTER, url: "local://photo.jpg" }
      },
      {
        clientOperationId: "op-leave",
        type: "LEAVE_REQUEST",
        payload: {
          storeId: "store-1",
          workerId: "worker-1",
          startDate: "2026-06-04T00:00:00.000Z",
          endDate: "2026-06-04T23:59:59.000Z",
          leaveType: "PERSONAL"
        }
      }
    ]
  });

  assert.equal(result.items[0]?.status, "FAILED");
  assert.match(result.items[0]?.message ?? "", /OSS unavailable/);
  assert.equal(result.items[1]?.status, "SYNCED");
});

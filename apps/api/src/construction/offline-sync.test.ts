import { test } from "node:test";
import assert from "node:assert/strict";
import { ConstructionPhotoStage, ConstructionTaskStatus } from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { ConstructionService, type AuthenticatedConstructionUser } from "./construction.service";

const offlineAccess = { can: async () => true, resolve: async () => ({ roles: [{ roleCode: "CONSTRUCTION" }] }) };

test("ConstructionService syncs offline photo status and leave operations in order", async () => {
  const prisma = {
    constructionPhoto: { findUnique: async () => null },
    order: { findUnique: async () => ({ storeId: "store-1" }) },
    orderLifecycleCommandRecord: { findUnique: async () => null },
    leaveRequest: { findUnique: async () => null }
  };
  const service = new ConstructionService(prisma as never, undefined, undefined, undefined, undefined, undefined, offlineAccess as never);
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
      ["op-photo", "APPLIED"],
      ["op-start", "APPLIED"],
      ["op-complete", "APPLIED"],
      ["op-leave", "APPLIED"]
    ]
  );
});

test("ConstructionService marks failed offline operations without stopping later operations", async () => {
  const prisma = {
    constructionPhoto: { findUnique: async () => null },
    leaveRequest: { findUnique: async () => null }
  };
  const service = new ConstructionService(prisma as never, undefined, undefined, undefined, undefined, undefined, offlineAccess as never);
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

  assert.equal(result.items[0]?.status, "RETRYABLE_FAILURE");
  assert.match(result.items[0]?.message ?? "", /OSS unavailable/);
  assert.equal(result.items[1]?.status, "APPLIED");
});

test("ConstructionService preserves replay, conflict and rejected offline outcomes", async () => {
  const prisma = {
    constructionPhoto: { findUnique: async () => ({ id: "photo-1" }) },
    order: { findUnique: async () => ({ storeId: "store-1" }) },
    orderLifecycleCommandRecord: { findUnique: async () => null },
    leaveRequest: { findUnique: async () => null }
  };
  const service = new ConstructionService(prisma as never, undefined, undefined, undefined, undefined, undefined, offlineAccess as never);
  const user: AuthenticatedConstructionUser = {
    id: "worker-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "CONSTRUCTION" }
  };
  service.uploadPhoto = async () => ({ id: "photo-1" });
  service.startOrder = async () => {
    throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "版本已变化" });
  };
  service.createLeave = async () => {
    throw new BadRequestException({ code: "LEAVE_INVALID", message: "请假日期无效" });
  };

  const result = await service.syncOfflineOperations(user, {
    operations: [
      { clientOperationId: "photo-replay", type: "PHOTO_UPLOAD", payload: { recordId: "record-1", stage: ConstructionPhotoStage.BEFORE, url: "local://photo.jpg" } },
      { clientOperationId: "task-conflict", type: "TASK_STATUS", payload: { orderId: "order-1", status: ConstructionTaskStatus.IN_CONSTRUCTION, expectedVersion: 1 } },
      { clientOperationId: "leave-rejected", type: "LEAVE_REQUEST", payload: { storeId: "store-1", workerId: "worker-1", startDate: "2026-06-04", endDate: "2026-06-04", leaveType: "PERSONAL" } }
    ]
  });

  assert.deepEqual(result.items.map((item) => [item.status, item.code]), [
    ["REPLAYED", undefined],
    ["CONFLICT", "LIFECYCLE_VERSION_CONFLICT"],
    ["REJECTED", "LEAVE_INVALID"]
  ]);
});

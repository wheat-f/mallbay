import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatus, QualityCheckResult, StorePosition } from "@prisma/client";
import { ConstructionService } from "./construction.service";

test("ConstructionService assigns one to three available workers and dispatches the order", async () => {
  const txCalls: string[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        status: OrderStatus.PENDING_DISPATCH
      }),
      update: async (args: unknown) => {
        txCalls.push(JSON.stringify(args));
      }
    },
    storeMember: {
      findMany: async () => [
        { userId: "worker-1", storeId: "store-1", position: StorePosition.CONSTRUCTION },
        { userId: "worker-2", storeId: "store-1", position: StorePosition.APPRENTICE }
      ]
    },
    leaveRequest: { findFirst: async () => null },
    constructionRecord: {
      create: async () => ({ id: "record-1", orderId: "order-1" })
    },
    constructionAssignment: {
      createMany: async (args: unknown) => {
        txCalls.push(JSON.stringify(args));
      }
    }
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new ConstructionService(prisma as never, {} as never);

  const result = await service.assignOrder(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    "order-1",
    { workerUserIds: ["worker-1", "worker-2"] }
  );

  assert.deepEqual(result, { id: "record-1", orderId: "order-1" });
  assert.equal(txCalls.some((call) => call.includes("\"status\":\"DISPATCHED\"")), true);
  assert.equal(txCalls.some((call) => call.includes("worker-1") && call.includes("worker-2")), true);
});

test("ConstructionService rejects assigning more than three workers", async () => {
  const service = new ConstructionService({ storeMember: { findUnique: async () => null } } as never, {} as never);

  await assert.rejects(
    () => service.assignOrder(
      {
        id: "scheduler-1",
        isAuditor: false,
        storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
      },
      "order-1",
      { workerUserIds: ["worker-1", "worker-2", "worker-3", "worker-4"] }
    ),
    /施工人员必须为 1 到 3 人/
  );
});

test("ConstructionService limits sales assignment list to their own orders", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    constructionRecord: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new ConstructionService(prisma as never, {} as never);

  await service.listAssignments(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    order: { salesPersonId: "sales-1" }
  });
});

test("ConstructionService starts completes and quality checks assigned tasks", async () => {
  const updates: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    constructionRecord: {
      findUnique: async () => ({
        id: "record-1",
        orderId: "order-1",
        storeId: "store-1",
        startedAt: new Date("2026-06-01T01:00:00.000Z"),
        completedAt: null,
        order: { id: "order-1", status: OrderStatus.IN_CONSTRUCTION },
        assignments: [{ workerUserId: "worker-1" }],
        photos: [{ stage: "BEFORE" }, { stage: "AFTER" }]
      }),
      update: async (args: unknown) => {
        updates.push(args);
        return { id: "record-1" };
      }
    },
    order: {
      update: async (args: unknown) => updates.push(args)
    },
    workerCommissionSnapshot: {
      findFirst: async () => null,
      createMany: async (args: unknown) => updates.push(args)
    }
  };
  const service = new ConstructionService(prisma as never, {} as never);

  const result = await service.completeOrder(
    {
      id: "worker-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
    },
    "record-1",
    { completedAt: "2026-06-01T10:30:00.000Z" }
  );

  assert.deepEqual(result, { id: "record-1" });
  assert.equal(JSON.stringify(updates).includes("overtimeMinutes"), true);
  assert.equal(JSON.stringify(updates).includes("COMPLETED"), true);

  await service.qualityCheck(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    "record-1",
    { result: QualityCheckResult.PASS, note: "ok" }
  );
  assert.equal(JSON.stringify(updates).includes("qualityResult"), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { LeaveRequestStatus, OrderStatus, QualityCheckResult, ScheduleStatus, StorePosition } from "@prisma/client";
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

test("ConstructionService lists construction store members even before profiles are maintained", async () => {
  const calls: unknown[] = [];
  const prisma = {
    constructionWorkerProfile: {
      findMany: async () => [{
        id: "profile-1",
        storeId: "store-1",
        userId: "worker-with-profile",
        canWorkOutside: true,
        skillTags: ["PPF"],
        isActive: true,
        user: { username: "worker1", nickname: "熟练师傅" }
      }]
    },
    storeMember: {
      findUnique: async () => null,
      findMany: async (args: unknown) => {
        calls.push(args);
        return [
          {
            userId: "worker-with-profile",
            position: StorePosition.CONSTRUCTION,
            user: { username: "worker1", nickname: "熟练师傅" }
          },
          {
            userId: "worker-without-profile",
            position: StorePosition.APPRENTICE,
            user: { username: "worker2", nickname: "新学徒" }
          }
        ];
      }
    }
  };
  const service = new ConstructionService(prisma as never, {} as never);

  const result = await service.listWorkers(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "store-1"
  );

  assert.equal(JSON.stringify(calls[0] ?? {}).includes("CONSTRUCTION"), true);
  assert.equal(JSON.stringify(calls[0] ?? {}).includes("APPRENTICE"), true);
  assert.deepEqual(result, [
    {
      id: "profile-1",
      storeId: "store-1",
      userId: "worker-with-profile",
      canWorkOutside: true,
      skillTags: ["PPF"],
      isActive: true,
      user: { username: "worker1", nickname: "熟练师傅" }
    },
    {
      storeId: "store-1",
      userId: "worker-without-profile",
      canWorkOutside: false,
      skillTags: [],
      isActive: true,
      user: { username: "worker2", nickname: "新学徒" }
    }
  ]);
});

test("ConstructionService lists store schedules for construction dispatchers", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    schedule: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [{ id: "schedule-1", workerId: "worker-1", status: ScheduleStatus.WORKING }];
      }
    }
  };
  const service = new ConstructionService(prisma as never, {} as never);

  const result = await service.listSchedules(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    { storeId: "store-1", from: "2026-06-01", to: "2026-06-07" }
  );

  assert.deepEqual(result, [{ id: "schedule-1", workerId: "worker-1", status: ScheduleStatus.WORKING }]);
  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    date: {
      gte: new Date("2026-06-01T00:00:00.000Z"),
      lte: new Date("2026-06-07T00:00:00.000Z")
    },
    workerId: undefined
  });
  assert.deepEqual((calls[0] as { include: unknown }).include, {
    worker: { select: { username: true, nickname: true } }
  });
});

test("ConstructionService limits worker schedules to their own rows", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    schedule: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new ConstructionService(prisma as never, {} as never);

  await service.listSchedules(
    {
      id: "worker-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
    },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    date: undefined,
    workerId: "worker-1"
  });
});

test("ConstructionService lists leave requests with worker summaries for manager approval", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    leaveRequest: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [
          {
            id: "leave-1",
            storeId: "store-1",
            workerId: "worker-1",
            startDate: new Date("2026-06-21T00:00:00.000Z"),
            endDate: new Date("2026-06-22T00:00:00.000Z"),
            status: LeaveRequestStatus.PENDING,
            worker: { id: "worker-1", username: "shigong", nickname: "施工师傅", avatarUrl: null }
          }
        ];
      }
    }
  };
  const service = new ConstructionService(prisma as never, {} as never);

  const result = await service.listLeaves(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    "store-1"
  );

  assert.equal(JSON.stringify(calls[0] ?? {}).includes("\"worker\""), true);
  assert.deepEqual((calls[0] as { include: unknown }).include, {
    worker: { select: { id: true, username: true, nickname: true, avatarUrl: true } }
  });
  assert.equal(result[0].worker.nickname, "施工师傅");
});

test("ConstructionService rejects schedule lists for unrelated store roles", async () => {
  const service = new ConstructionService({ storeMember: { findUnique: async () => null } } as never, {} as never);

  await assert.rejects(
    () => service.listSchedules(
      {
        id: "sales-1",
        isAuditor: false,
        storeMember: { storeId: "store-1", position: StorePosition.SALES }
      },
      { storeId: "store-1" }
    ),
    /无权限/
  );
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

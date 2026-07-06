import assert from "node:assert/strict";
import { test } from "node:test";
import { AfterSaleResponsibility, AfterSaleStatus, StorePosition } from "@prisma/client";
import { AfterSalesService } from "./after-sales.service";

test("AfterSalesService creates after-sale linked to order warranty customer and issue photo evidence", async () => {
  const writes: unknown[] = [];
  const prisma = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        customerId: "customer-1",
        warranty: { id: "warranty-1" }
      })
    },
    afterSale: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "after-sale-1", status: AfterSaleStatus.OPEN };
      }
    },
    afterSalePhoto: {
      createMany: async (args: unknown) => writes.push(args)
    }
  };
  const service = new AfterSalesService(prisma as never);

  const result = await service.create(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    {
      orderId: "order-1",
      description: "边角起翘",
      issuePhotos: [{ url: "https://img.example/issue-1.jpg", note: "左后门边角起翘" }]
    }
  );

  assert.equal(result.id, "after-sale-1");
  assert.equal(JSON.stringify(writes).includes("warranty-1"), true);
  assert.equal(JSON.stringify(writes).includes("customer-1"), true);
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("issue-1.jpg"), true);
  assert.equal(serialized.includes("左后门边角起翘"), true);
  assert.equal(serialized.includes('"stage":"ISSUE"'), true);
  assert.equal(serialized.includes('"uploadedById":"scheduler-1"'), true);
});

test("AfterSalesService assigns workers and records responsibility category photo evidence and penalty", async () => {
  const writes: unknown[] = [];
  const prisma = {
    afterSale: {
      findUnique: async () => ({ id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.OPEN }),
      update: async (args: unknown) => writes.push(args)
    },
    storeMember: {
      findUnique: async () => null,
      findMany: async () => [{ userId: "worker-1", position: StorePosition.CONSTRUCTION }]
    },
    afterSaleAssignment: {
      createMany: async (args: unknown) => writes.push(args)
    },
    penalty: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "penalty-1" };
      }
    },
    afterSalePhoto: {
      createMany: async (args: unknown) => writes.push(args)
    }
  };
  const service = new AfterSalesService(prisma as never);

  await service.assign(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    "after-sale-1",
    { workerUserIds: ["worker-1"] }
  );
  await service.judgeResponsibility(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "after-sale-1",
    {
      responsibility: AfterSaleResponsibility.CONSTRUCTION,
      constructionIssueCategory: "刀工问题",
      constructionPhotos: [{ url: "https://img.example/after-1.jpg", note: "返工后边角复查" }],
      supplementPhotos: [{ url: "https://img.example/supplement-1.jpg", note: "客户确认记录" }],
      penaltyWorkerUserId: "worker-1",
      penaltyAmountCents: 1000,
      penaltyReason: "返工处罚"
    }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("worker-1"), true);
  assert.equal(serialized.includes(AfterSaleResponsibility.CONSTRUCTION), true);
  assert.equal(serialized.includes("刀工问题"), true);
  assert.equal(serialized.includes("after-1.jpg"), true);
  assert.equal(serialized.includes("supplement-1.jpg"), true);
  assert.equal(serialized.includes("返工后边角复查"), true);
  assert.equal(serialized.includes("客户确认记录"), true);
  assert.equal(serialized.includes('"stage":"CONSTRUCTION_AFTER"'), true);
  assert.equal(serialized.includes('"stage":"SUPPLEMENT"'), true);
  assert.equal(serialized.includes('"uploadedById":"manager-1"'), true);
  assert.equal(serialized.includes("\"amountCents\":1000"), true);
});

test("AfterSalesService lists after-sales with order customer vehicle warranty and normalized photo evidence", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new AfterSalesService(prisma as never);

  await service.list(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    { storeId: "store-1" }
  );

  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"orderNo"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
  assert.match(serialized, /"warranty"/);
  assert.match(serialized, /"photos"/);
  assert.match(serialized, /"stage"/);
  assert.match(serialized, /"uploadedBy"/);
  assert.match(serialized, /"note"/);
  assert.match(serialized, /"constructionIssueCategory"/);
});

test("AfterSalesService returns after-sale detail with assigned workers and penalty workers", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findFirst: async (args: unknown) => {
        calls.push(args);
        return { id: "after-sale-1", storeId: "store-1" };
      }
    }
  };
  const service = new AfterSalesService(prisma as never);

  await service.detail(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "after-sale-1"
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, { id: "after-sale-1", storeId: "store-1" });
  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"assignments"/);
  assert.match(serialized, /"worker"/);
  assert.match(serialized, /"username"/);
  assert.match(serialized, /"nickname"/);
  assert.match(serialized, /"penalties"/);
  assert.match(serialized, /"amountCents"/);
  assert.match(serialized, /"reason"/);
  assert.match(serialized, /"createdBy"/);
  assert.match(serialized, /"photos"/);
  assert.match(serialized, /"uploadedBy"/);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
});

test("AfterSalesService closes a resolved after-sale", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findUnique: async () => ({ id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.RESOLVED }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "after-sale-1", status: AfterSaleStatus.CLOSED };
      }
    }
  };
  const service = new AfterSalesService(prisma as never);

  const result = await service.close(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "after-sale-1"
  );

  assert.equal(result.status, AfterSaleStatus.CLOSED);
  const serialized = JSON.stringify(writes[0]);
  assert.match(serialized, /"status":"CLOSED"/);
  assert.match(serialized, /"closedAt"/);
});

test("AfterSalesService limits construction workers to assigned after-sales", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new AfterSalesService(prisma as never);

  await service.list(
    {
      id: "worker-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
    },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    assignments: { some: { workerUserId: "worker-1" } }
  });
});

test("AfterSalesService limits sales after-sales list to their own orders", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new AfterSalesService(prisma as never);

  await service.list(
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

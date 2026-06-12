import assert from "node:assert/strict";
import { test } from "node:test";
import { AfterSaleResponsibility, AfterSaleStatus, StorePosition } from "@prisma/client";
import { AfterSalesService } from "./after-sales.service";

test("AfterSalesService creates after-sale linked to order warranty and customer", async () => {
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
    }
  };
  const service = new AfterSalesService(prisma as never);

  const result = await service.create(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    { orderId: "order-1", description: "边角起翘" }
  );

  assert.equal(result.id, "after-sale-1");
  assert.equal(JSON.stringify(writes).includes("warranty-1"), true);
  assert.equal(JSON.stringify(writes).includes("customer-1"), true);
});

test("AfterSalesService assigns workers and records responsibility penalty", async () => {
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
      penaltyWorkerUserId: "worker-1",
      penaltyAmountCents: 1000,
      penaltyReason: "返工处罚"
    }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("worker-1"), true);
  assert.equal(serialized.includes(AfterSaleResponsibility.CONSTRUCTION), true);
  assert.equal(serialized.includes("\"amountCents\":1000"), true);
});

test("AfterSalesService lists after-sales with order customer and vehicle summary", async () => {
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

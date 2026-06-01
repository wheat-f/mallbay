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

import assert from "node:assert/strict";
import { test } from "node:test";
import { CommissionRuleType, StorePosition } from "@prisma/client";
import { CommissionsService } from "./commissions.service";

test("CommissionsService creates sales commission rule and generates order snapshot", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    salesCommissionRule: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "rule-1" };
      },
      findFirst: async () => ({ id: "rule-1", rateBasisPoints: 500, fixedAmountCents: null })
    },
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        amount: { totalAmountCents: 100000 }
      })
    },
    salesCommissionLog: {
      upsert: async (args: unknown) => {
        writes.push(args);
        return { id: "log-1", amountCents: 5000 };
      }
    }
  };
  const accessContext = { can: async () => true };
  const service = new CommissionsService(prisma as never, accessContext as never);

  await service.createSalesRule(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    { storeId: "store-1", name: "销售 5%", ruleType: CommissionRuleType.FIXED_RATE, rateBasisPoints: 500 }
  );
  const result = await service.generateSalesCommission(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "order-1"
  );

  assert.equal(result.amountCents, 5000);
  assert.equal(JSON.stringify(writes).includes("销售 5%"), true);
});

test("CommissionsService generates worker commission under the ordering store", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    constructionRecord: {
      findUnique: async () => ({
        id: "record-1",
        storeId: "ordering-store",
        orderId: "order-1",
        assignments: [{ workerUserId: "worker-1" }]
      })
    },
    workerCommission: {
      upsert: async (args: unknown) => {
        writes.push(args);
        return { id: "commission-1", finalAmountCents: 1500 };
      }
    }
  };
  const accessContext = { can: async () => true };
  const service = new CommissionsService(prisma as never, accessContext as never);

  const result = await service.generateWorkerCommissions(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "ordering-store", position: StorePosition.MANAGER }
    },
    "record-1",
    { baseAmountCents: 1000, adjustments: [{ workerUserId: "worker-1", adjustmentCents: 500 }] }
  );

  assert.equal(result.length, 1);
  assert.equal(JSON.stringify(writes).includes("\"finalAmountCents\":1500"), true);
  assert.equal(JSON.stringify(writes).includes("\"storeId\":\"ordering-store\""), true);
});

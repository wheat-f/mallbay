import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { ReportsService } from "./reports.service";

test("ReportsService returns operating metrics for managers and admins", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: { count: async () => 3 },
    orderAmount: { aggregate: async () => ({ _sum: { totalAmountCents: 120000, paidAmountCents: 100000 } }) },
    constructionRecord: { count: async () => 2 },
    afterSale: { count: async () => 1 },
    invoice: { count: async () => 1 },
    customerRebate: { count: async () => 1 }
  };
  const service = new ReportsService(prisma as never);

  const result = await service.summary(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    { storeId: "store-1" }
  );

  assert.deepEqual(result, {
    orders: 3,
    totalAmountCents: 120000,
    paidAmountCents: 100000,
    constructionRecords: 2,
    afterSales: 1,
    invoices: 1,
    rebates: 1
  });
});

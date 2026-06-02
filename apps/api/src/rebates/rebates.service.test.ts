import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatus, RebateStatus, StorePosition } from "@prisma/client";
import { RebatesService } from "./rebates.service";

test("RebatesService applies approves and pays rebate for paid completed order", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0 }
      })
    },
    customerRebate: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "rebate-1", status: RebateStatus.APPLIED };
      },
      findUnique: async () => ({ id: "rebate-1", storeId: "store-1", amountCents: 2000 }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "rebate-1", status: RebateStatus.PAID };
      }
    },
    rebateLog: { create: async (args: unknown) => writes.push(args) },
    paymentRecord: { create: async (args: unknown) => writes.push(args) }
  };
  const service = new RebatesService(prisma as never);

  await service.apply(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { orderId: "order-1", amountCents: 2000, reason: "客户返利" }
  );
  await service.approve(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    "rebate-1",
    { status: RebateStatus.APPROVED, note: "ok" }
  );
  const paid = await service.pay(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "rebate-1",
    { note: "paid" }
  );

  assert.equal(paid.status, RebateStatus.PAID);
  assert.equal(JSON.stringify(writes).includes("REBATE"), true);
});

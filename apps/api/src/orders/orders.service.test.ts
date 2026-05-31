import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentType, StorePosition } from "@prisma/client";
import { OrdersService } from "./orders.service";

test("OrdersService recalculates paid and outstanding amount after payment", async () => {
  const updates: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        amount: { totalAmountCents: 5000000 }
      })
    },
    paymentAccount: {
      findUnique: async () => ({ id: "account-1", storeId: "store-1", isActive: true })
    },
    orderPayment: {
      create: async () => ({ id: "payment-1" }),
      aggregate: async () => ({ _sum: { amountCents: 1500000 } })
    },
    orderAmount: {
      update: async (args: unknown) => {
        updates.push(args);
      }
    }
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new OrdersService(prisma as never, {} as never);

  const result = await service.addPayment(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "order-1",
    {
      accountId: "account-1",
      paymentType: PaymentType.BALANCE,
      amountCents: 1500000,
      paidAt: "2026-05-31T12:00:00.000Z"
    }
  );

  assert.deepEqual(result, { id: "payment-1" });
  assert.deepEqual(updates, [
    {
      where: { orderId: "order-1" },
      data: {
        paidAmountCents: 1500000,
        outstandingCents: 3500000
      }
    }
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { CustomerType, StorePosition } from "@prisma/client";
import { SettlementExecutionImplementation } from "./settlement-execution-implementation";

test("企业统一收款会在同一事务递增订单履约版本并写现金来源账本", async () => {
  const versionChanges: unknown[] = [];
  const amountUpdates: unknown[] = [];
  const tx = {
    customerReceipt: {
      findFirst: async () => null,
      create: async () => ({ id: "receipt-1", receiptNo: "RCT-1" }),
      findUniqueOrThrow: async () => ({ id: "receipt-1", amountCents: 1000, reversals: [] })
    },
      orderPayment: { create: async () => ({ id: "payment-1" }) },
      orderAmount: {
        updateMany: async (args: unknown) => {
          amountUpdates.push(args);
          return { count: 1 };
        }
      },
    order: {
      findUnique: async () => ({ lifecycleVersion: 3 }),
      updateMany: async () => ({ count: 1 })
    },
    orderLifecycleVersionChange: {
      create: async (args: unknown) => {
        versionChanges.push(args);
      }
    },
    auditEvent: { create: async () => undefined }
  };
  const prisma = {
    customer: {
      findFirst: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1", customerType: CustomerType.COMPANY })
    },
    paymentAccount: {
      findFirst: async () => ({ id: "account-1", storeId: "store-1", isActive: true })
    },
    customerReceipt: {
      findFirst: async () => null
    },
    order: {
      findMany: async () => [{
        id: "order-1",
        orderNo: "ORD-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        amount: { outstandingCents: 1000 },
        constructionRecord: { completedAt: new Date("2026-01-02T00:00:00.000Z") }
      }]
    },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new SettlementExecutionImplementation(
    prisma as never,
    { can: async () => true } as never,
    undefined,
    { recordCustomerReceipt: async () => undefined } as never
  );

  await service.createReceipt(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    {
      storeId: "store-1",
      customerId: "customer-1",
      amountCents: 1000,
      idempotencyKey: "receipt-command-1",
      accountId: "account-1",
      receivedAt: "2026-01-03T00:00:00.000Z",
      allocations: [{ orderId: "order-1", amountCents: 1000 }]
    }
  );

  assert.deepEqual(amountUpdates, [{
    where: { orderId: "order-1", outstandingCents: { gte: 1000 } },
    data: { paidAmountCents: { increment: 1000 }, outstandingCents: { decrement: 1000 } }
  }]);
  assert.deepEqual(versionChanges, [{
    data: {
      orderId: "order-1",
      beforeVersion: 3,
      afterVersion: 4,
      sourceType: "CASH",
      sourceKey: "CUSTOMER_RECEIPT:receipt-1:order-1",
      sourceRefs: {
        customerReceiptId: "receipt-1",
        orderId: "order-1",
        amountCents: 1000,
        direction: "POSTED"
      }
    }
  }]);
});

test("企业收款同幂等键复用不同收款时间会返回冲突", async () => {
  const existing = {
    customerId: "customer-1",
    accountId: "account-1",
    amountCents: 1000,
    receivedAt: new Date("2026-01-03T00:00:00.000Z"),
    payerName: null,
    bankSerialNo: null,
    note: null,
    allocations: [{ orderId: "order-1", amountCents: 1000 }],
    reversals: []
  };
  const service = new SettlementExecutionImplementation({
    customer: { findFirst: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1", customerType: CustomerType.COMPANY }) },
    paymentAccount: { findFirst: async () => ({ id: "account-1", storeId: "store-1", isActive: true }) },
    customerReceipt: { findFirst: async () => existing }
  } as never, { can: async () => true } as never, undefined, {} as never);

  await assert.rejects(
    service.createReceipt({ id: "finance-1" }, {
      storeId: "store-1",
      customerId: "customer-1",
      amountCents: 1000,
      idempotencyKey: "receipt-command-1",
      accountId: "account-1",
      receivedAt: "2026-01-04T00:00:00.000Z",
      allocations: [{ orderId: "order-1", amountCents: 1000 }]
    }),
    (error) => error instanceof ConflictException
  );
});

test("创建对账单拒绝已被未作废对账单占用的订单", async () => {
  const tx = {
    customerStatement: { findFirst: async () => null },
    customerStatementItem: { findFirst: async () => ({ orderId: "order-1" }) }
  };
  const service = new SettlementExecutionImplementation({
    customer: { findFirst: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1", customerType: CustomerType.COMPANY }) },
    customerStatement: { findFirst: async () => null },
    order: {
      findMany: async () => [{
        id: "order-1",
        orderNo: "ORD-1",
        status: "COMPLETED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        amount: { totalAmountCents: 1000, paidAmountCents: 0, outstandingCents: 1000 },
        appointmentDate: null,
        vehicle: null,
        contactSnapshot: null,
        constructionRecord: null
      }]
    },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  } as never, { can: async () => true } as never, undefined, {} as never);

  await assert.rejects(
    service.createStatement({ id: "finance-1" }, {
      storeId: "store-1",
      customerId: "customer-1",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-01-31T00:00:00.000Z",
      orderIds: ["order-1"],
      idempotencyKey: "statement-command-1"
    }),
    (error) => error instanceof ConflictException
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CashFactWriter, type CashFactRecord, type CashFactTransaction } from "./cash-fact-writer";

function input(overrides: Partial<CashFactRecord> = {}): CashFactRecord {
  return {
    id: "payment-1",
    storeId: "store-1",
    accountId: "account-1",
    type: "ORDER_PAYMENT",
    direction: "INCOME",
    amountCents: 1000,
    sourceType: "ORDER_PAYMENT",
    sourceId: "order-payment-1",
    note: "订单收款",
    createdById: "user-1",
    occurredAt: new Date("2026-08-22T00:00:00.000Z"),
    idempotencyKey: "ORDER_PAYMENT:order-1:payment-1",
    ...overrides
  };
}

test("CashFactWriter creates an order cash fact through the narrow transaction context", async () => {
  const writes: unknown[] = [];
  const transaction: CashFactTransaction = {
    paymentRecord: {
      findFirst: async () => null,
      create: async ({ data }) => {
        writes.push(data);
        return input(data);
      }
    }
  };

  const result = await new CashFactWriter().recordOrderPayment(transaction, {
    storeId: "store-1",
    accountId: "account-1",
    amountCents: 1000,
    sourceType: "ORDER_PAYMENT",
    sourceId: "order-payment-1",
    note: "订单收款",
    createdById: "user-1",
    occurredAt: new Date("2026-08-22T00:00:00.000Z"),
    idempotencyKey: "ORDER_PAYMENT:order-1:payment-1"
  });

  assert.deepEqual(result, {
    recordId: "payment-1",
    created: true,
    type: "ORDER_PAYMENT",
    sourceId: "order-payment-1",
    amountCents: 1000
  });
  assert.equal(writes.length, 1);
});

test("CashFactWriter returns a matching idempotent cash fact without creating another record", async () => {
  let creates = 0;
  const existing = input();
  const transaction: CashFactTransaction = {
    paymentRecord: {
      findFirst: async () => existing,
      create: async () => {
        creates += 1;
        return existing;
      }
    }
  };

  const result = await new CashFactWriter().recordOrderPayment(transaction, {
    storeId: existing.storeId,
    accountId: existing.accountId,
    amountCents: existing.amountCents,
    sourceType: existing.sourceType,
    sourceId: existing.sourceId,
    note: existing.note,
    createdById: existing.createdById,
    occurredAt: existing.occurredAt,
    idempotencyKey: existing.idempotencyKey
  });

  assert.equal(result.created, false);
  assert.equal(result.recordId, existing.id);
  assert.equal(creates, 0);
});

test("CashFactWriter rejects an idempotency key reused with different cash facts", async () => {
  const existing = input();
  const transaction: CashFactTransaction = {
    paymentRecord: {
      findFirst: async () => existing,
      create: async () => existing
    }
  };

  await assert.rejects(
    () => new CashFactWriter().recordOrderPayment(transaction, {
      storeId: existing.storeId,
      accountId: existing.accountId,
      amountCents: 2000,
      sourceType: existing.sourceType,
      sourceId: existing.sourceId,
      note: existing.note,
      createdById: existing.createdById,
      occurredAt: existing.occurredAt,
      idempotencyKey: existing.idempotencyKey
    }),
    /相同现金事实幂等键已绑定不同输入/
  );
});

test("CashFactWriter rejects an idempotency key reused with a different reversal target", async () => {
  const existing = input({ reversalOfId: "payment-original-1" });
  const transaction: CashFactTransaction = {
    paymentRecord: {
      findFirst: async () => existing,
      create: async () => existing
    }
  };

  await assert.rejects(
    () => new CashFactWriter().write(transaction, {
      ...existing,
      type: "CUSTOMER_RECEIPT_REVERSAL",
      direction: "EXPENSE",
      reversalOfId: "payment-original-2"
    }),
    /相同现金事实幂等键已绑定不同输入/
  );
});

test("CashFactWriter maps a database uniqueness race to a retryable conflict", async () => {
  const transaction: CashFactTransaction = {
    paymentRecord: {
      findFirst: async () => null,
      create: async () => { throw { code: "P2002" }; }
    }
  };

  await assert.rejects(
    () => new CashFactWriter().recordOrderPayment(transaction, input()),
    (error: unknown) => error instanceof Error && error.message.includes("相同现金事实正在被其他事务写入")
  );
});

test("CashFactWriter fixes supplier refund types and preserves reversal linkage", async () => {
  const writes: CashFactRecord[] = [];
  const transaction: CashFactTransaction = {
    paymentRecord: {
      findFirst: async () => null,
      create: async ({ data }) => {
        const record = input(data);
        writes.push(record);
        return record;
      }
    }
  };

  await new CashFactWriter().recordSupplierRefundPayout(transaction, {
    storeId: "store-1",
    accountId: "account-1",
    amountCents: 800,
    sourceType: "SUPPLIER_RETURN_SETTLEMENT",
    sourceId: "adjustment-1",
    createdById: "finance-1",
    occurredAt: new Date("2026-08-22T01:00:00.000Z"),
    idempotencyKey: "supplier-refund-1"
  });
  await new CashFactWriter().recordSupplierRefundReversal(transaction, {
    storeId: "store-1",
    accountId: "account-1",
    amountCents: 800,
    sourceType: "SUPPLIER_RETURN_SETTLEMENT",
    sourceId: "adjustment-1",
    createdById: "finance-1",
    occurredAt: new Date("2026-08-22T02:00:00.000Z"),
    idempotencyKey: "supplier-reversal-1",
    reversalOfId: "payment-original-1"
  });

  assert.deepEqual(writes.map(({ type, direction, reversalOfId }) => ({ type, direction, reversalOfId })), [
    { type: "SUPPLIER_REFUND_OUT", direction: "OUTFLOW", reversalOfId: undefined },
    { type: "SUPPLIER_REFUND_REVERSAL", direction: "INFLOW", reversalOfId: "payment-original-1" }
  ]);
});

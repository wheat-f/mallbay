import assert from "node:assert/strict";
import test from "node:test";
import { buildAutomaticReceiptAllocation } from "./receipt-allocation";

test("automatic receipt allocation uses completion time, creation time and order number", () => {
  const allocations = buildAutomaticReceiptAllocation(1_500, [
    {
      orderId: "order-newer",
      orderNo: "ORD-002",
      outstandingCents: 1_000,
      completedAt: new Date("2026-07-10T00:00:00.000Z"),
      createdAt: new Date("2026-07-02T00:00:00.000Z")
    },
    {
      orderId: "order-older",
      orderNo: "ORD-001",
      outstandingCents: 1_000,
      completedAt: new Date("2026-07-01T00:00:00.000Z"),
      createdAt: new Date("2026-07-01T00:00:00.000Z")
    }
  ]);

  assert.deepEqual(allocations, [
    { orderId: "order-older", amountCents: 1_000 },
    { orderId: "order-newer", amountCents: 500 }
  ]);
});

test("automatic receipt allocation rejects over-allocation", () => {
  assert.throws(
    () => buildAutomaticReceiptAllocation(1_001, [
      {
        orderId: "order-1",
        orderNo: "ORD-001",
        outstandingCents: 1_000,
        completedAt: null,
        createdAt: new Date("2026-07-01T00:00:00.000Z")
      }
    ]),
    /不能超过所选订单待收总额/
  );
});

test("orders without completion time are allocated after completed orders", () => {
  const allocations = buildAutomaticReceiptAllocation(1_500, [
    {
      orderId: "order-unfinished",
      orderNo: "ORD-001",
      outstandingCents: 1_000,
      completedAt: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z")
    },
    {
      orderId: "order-completed",
      orderNo: "ORD-002",
      outstandingCents: 1_000,
      completedAt: new Date("2026-07-01T00:00:00.000Z"),
      createdAt: new Date("2026-07-01T00:00:00.000Z")
    }
  ]);

  assert.deepEqual(allocations, [
    { orderId: "order-completed", amountCents: 1_000 },
    { orderId: "order-unfinished", amountCents: 500 }
  ]);
});

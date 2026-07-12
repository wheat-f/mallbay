import assert from "node:assert/strict";
import { test } from "node:test";
import type { RebateSummary } from "@mallbay/shared";
import { getRebateRowsForWorkflow, getRebateWorkflowCounts } from "./workflow";

function rebate(id: string, status: RebateSummary["status"]): RebateSummary {
  return {
    id,
    storeId: "store-1",
    orderId: `order-${id}`,
    amountCents: 1000,
    reason: "客户返利",
    status
  };
}

test("rebate workflow filters rows by the real rebate process stage", () => {
  const rows = [
    rebate("applied", "APPLIED"),
    rebate("reviewed", "REVIEWED"),
    rebate("approved", "APPROVED"),
    rebate("paid", "PAID"),
    rebate("rejected", "REJECTED")
  ];

  assert.deepEqual(getRebateRowsForWorkflow(rows, "application").map((item) => item.id), [
    "applied",
    "reviewed",
    "approved",
    "paid",
    "rejected"
  ]);
  assert.deepEqual(getRebateRowsForWorkflow(rows, "review").map((item) => item.id), ["applied"]);
  assert.deepEqual(getRebateRowsForWorkflow(rows, "finance").map((item) => item.id), ["reviewed"]);
  assert.deepEqual(getRebateRowsForWorkflow(rows, "payout").map((item) => item.id), ["approved"]);
  assert.deepEqual(getRebateRowsForWorkflow(rows, "report").map((item) => item.id), [
    "applied",
    "reviewed",
    "approved",
    "paid",
    "rejected"
  ]);
});

test("rebate workflow counts expose each queue shown by the page tabs", () => {
  const counts = getRebateWorkflowCounts([
    rebate("applied", "APPLIED"),
    rebate("reviewed", "REVIEWED"),
    rebate("approved", "APPROVED"),
    rebate("paid", "PAID"),
    rebate("rejected", "REJECTED")
  ]);

  assert.deepEqual(counts, {
    application: 5,
    review: 1,
    finance: 1,
    payout: 1,
    report: 5,
    paid: 1,
    rejected: 1
  });
});

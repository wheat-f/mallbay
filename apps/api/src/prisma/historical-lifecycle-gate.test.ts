import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkHistoricalLifecycleGate,
  formatHistoricalLifecycleViolations
} from "./historical-lifecycle-gate";

test("historical lifecycle gate passes when every query is clean", async () => {
  const queries: string[] = [];
  const violations = await checkHistoricalLifecycleGate({
    $queryRawUnsafe: async (query: string) => {
      queries.push(query);
      return [];
    }
  });
  assert.equal(violations.length, 0);
  assert.equal(queries.length, 5);
});

test("historical lifecycle gate reports stable violation codes and rows", async () => {
  const violations = await checkHistoricalLifecycleGate({
    $queryRawUnsafe: async (query: string) => query.includes('"Warranty"')
      ? [{ orderId: "order-1", status: "COMPLETED" }]
      : []
  });
  assert.deepEqual(violations.map((item) => item.invariant), [
    "terminal_order_warranty_missing",
    "historical_violation_without_case"
  ]);
  assert.match(formatHistoricalLifecycleViolations(violations), /不得恢复非终态写入/);
  assert.match(formatHistoricalLifecycleViolations(violations), /order-1/);
});

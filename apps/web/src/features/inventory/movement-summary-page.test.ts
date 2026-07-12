import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory movement ledger exposes filtered movement summary", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /getInventoryMovementSummary/);
  assert.match(movementsSource, /movementSummary/);
  assert.match(movementsSource, /今日入库总量/);
  assert.match(movementsSource, /今日出库总量/);
  assert.match(movementsSource, /异常波动笔数/);
});

test("inventory matching page delegates complete ledger work to the movement page", () => {
  const matchingSource = readFileSync("app/inventory/matching/page.tsx", "utf8");

  assert.match(matchingSource, /href="\/inventory\/movements"/);
  assert.doesNotMatch(matchingSource, /getInventoryMovementSummary/);
  assert.doesNotMatch(matchingSource, /流水统计/);
});

test("inventory movement ledger does not fall back to technical batch ids", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /INVENTORY_BATCH_MISSING_LABEL/);
  assert.doesNotMatch(movementsSource, /batch \? getInventoryBatchLabel\(batch, productMap\) : row\.batchId/);
});

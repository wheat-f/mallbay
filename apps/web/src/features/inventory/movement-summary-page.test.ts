import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory movement tab exposes filtered movement summary", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /getInventoryMovementSummary/);
  assert.match(pageSource, /movementSummary/);
  assert.match(pageSource, /流水统计/);
  assert.match(pageSource, /入库合计/);
  assert.match(pageSource, /出库合计/);
  assert.match(pageSource, /锁定合计/);
});

test("inventory movement tab does not fall back to technical batch ids", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /INVENTORY_BATCH_MISSING_LABEL/);
  assert.doesNotMatch(pageSource, /batch \? getInventoryBatchLabel\(batch, productMap\) : row\.batchId/);
});

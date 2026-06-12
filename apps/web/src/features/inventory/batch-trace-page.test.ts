import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory batch table can jump to filtered movement trace", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /activeInventoryTab/);
  assert.match(pageSource, /traceBatchMovements/);
  assert.match(pageSource, /setActiveInventoryTab\("movements"\)/);
  assert.match(pageSource, /movementFilterForm\.setFieldsValue\(\{\s*batchId:\s*batch\.id\s*\}\)/);
  assert.match(pageSource, /setMovementFilters\(\{\s*batchId:\s*batch\.id\s*\}\)/);
  assert.match(pageSource, /批次追溯/);
});

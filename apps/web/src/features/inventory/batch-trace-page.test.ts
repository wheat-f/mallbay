import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory matching page links batch trace work to the movement ledger", () => {
  const matchingSource = readFileSync("app/inventory/matching/page.tsx", "utf8");
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(matchingSource, /href="\/inventory\/movements"/);
  assert.match(matchingSource, /批次追溯/);
  assert.match(movementsSource, /批次追踪/);
  assert.doesNotMatch(matchingSource, /activeInventoryTab/);
  assert.doesNotMatch(matchingSource, /traceBatchMovements/);
  assert.doesNotMatch(matchingSource, /setActiveInventoryTab\("movements"\)/);
  assert.doesNotMatch(matchingSource, /movementFilterForm\.setFieldsValue/);
});

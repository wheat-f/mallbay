import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory page exposes advanced movement filters in the movement tab", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /movementFilterForm/);
  assert.match(pageSource, /movementFilters/);
  assert.match(pageSource, /productId/);
  assert.match(pageSource, /batchId/);
  assert.match(pageSource, /movementType/);
  assert.match(pageSource, /orderId/);
  assert.match(pageSource, /createdById/);
  assert.match(pageSource, /inventoryApi\.movements\(\{\s*storeId:\s*storeId!,\s*\.\.\.movementFilters\s*\}\)/);
});

test("inventory movement filters use business selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /const movementOrderOptions =/);
  assert.match(pageSource, /const movementOperatorOptions =/);
  assert.match(pageSource, /userApi\.searchUsers/);
  assert.match(pageSource, /placeholder="选择订单"/);
  assert.match(pageSource, /options=\{movementOrderOptions\}/);
  assert.match(pageSource, /placeholder="搜索操作人"/);
  assert.match(pageSource, /options=\{movementOperatorOptions\}/);
  assert.doesNotMatch(pageSource, /placeholder="输入订单 ID"/);
  assert.doesNotMatch(pageSource, /placeholder="输入用户 ID"/);
});

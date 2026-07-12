import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory matching page no longer owns movement ledger filters", () => {
  const matchingSource = readFileSync("app/inventory/matching/page.tsx", "utf8");

  assert.doesNotMatch(matchingSource, /movementFilterForm/);
  assert.doesNotMatch(matchingSource, /movementFilters/);
  assert.doesNotMatch(matchingSource, /inventoryApi\.movements/);
  assert.match(matchingSource, /href="\/inventory\/movements"/);
});

test("inventory movement page exposes advanced movement filters", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /filterForm/);
  assert.match(movementsSource, /movementFilters/);
  assert.match(movementsSource, /productId/);
  assert.match(movementsSource, /batchId/);
  assert.match(movementsSource, /movementType/);
  assert.match(movementsSource, /orderId/);
  assert.match(movementsSource, /createdById/);
  assert.match(movementsSource, /inventoryApi\.movements\(\{ storeId: storeId!, \.\.\.movementFilters \}\)/);
});

test("inventory product selectors do not expose technical product ids as labels", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.doesNotMatch(movementsSource, /getProductDisplayName\(\{[\s\S]*?\}\) \|\| product\.id/);
  assert.match(movementsSource, /getProductDisplayName\(\{[\s\S]*?\}\) \|\| "未命名产品"/);
});

test("inventory movement filters use business selectors instead of manual ids", () => {
  const matchingSource = readFileSync("app/inventory/matching/page.tsx", "utf8");
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /orderApi\.list\(\{ storeId: storeId!, pageSize: 100 \}\)/);
  assert.match(movementsSource, /const movementOrderOptions =/);
  assert.match(movementsSource, /placeholder="输入Order\/Purchase ID"/);
  assert.match(movementsSource, /options=\{movementOrderOptions\}/);
  assert.doesNotMatch(matchingSource, /placeholder="输入订单 ID"/);
  assert.doesNotMatch(matchingSource, /placeholder="输入用户 ID"/);
  assert.doesNotMatch(matchingSource, /placeholder="搜索操作人"/);
  assert.doesNotMatch(movementsSource, /placeholder="输入订单号或采购单号"/);
  assert.doesNotMatch(movementsSource, /placeholder="输入订单 ID"/);
});

test("inventory movement operator selectors do not render blank labels", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /\[operator\.nickname, `@\${operator\.username}`\]\.filter\(Boolean\)\.join\(" "\) \|\| "未知操作人"/);
});

test("inventory movement ledger uses business-safe fallback labels", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /规格待确认/);
  assert.match(movementsSource, /关联单据待确认/);
  assert.match(movementsSource, /操作人待确认/);
  assert.doesNotMatch(movementsSource, /规格未加载/);
  assert.doesNotMatch(movementsSource, /关联单据未加载/);
  assert.doesNotMatch(movementsSource, /操作人未加载/);
});

test("inventory movement ledger matches prototype source number filter wording", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");

  assert.match(movementsSource, /name="orderId" label="关联单号"/);
  assert.match(movementsSource, /placeholder="输入Order\/Purchase ID"/);
  assert.doesNotMatch(movementsSource, /name="orderId" label="关联订单"/);
});

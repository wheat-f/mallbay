import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("construction assignments page uses worker business labels", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const workerMap =/);
  assert.match(pageSource, /options=\{workers\.map/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /workerUserId\)\.join\("、"\)/);
});

test("construction assignments page does not fall back to technical order ids", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /row\.order\?\.orderNo \?\? row\.orderId/);
});

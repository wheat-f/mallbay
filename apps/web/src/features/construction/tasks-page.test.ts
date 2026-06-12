import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("construction tasks page renders status with business labels", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /getConstructionStatusLabel/);
  assert.doesNotMatch(pageSource, /<Tag>\{row\.status\}<\/Tag>/);
});

test("construction tasks page does not fall back to technical order ids", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /row\.order\?\.orderNo \?\? row\.orderId/);
});

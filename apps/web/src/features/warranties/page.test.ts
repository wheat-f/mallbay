import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("warranties page creates warranty records by selecting a completed order", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /status: "COMPLETED"/);
  assert.match(pageSource, /const completedOrderOptions =/);
  assert.match(pageSource, /<Select[\s\S]*placeholder="选择已完工订单"/);
  assert.match(pageSource, /options=\{completedOrderOptions\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="已完工订单 ID"/);
});

test("warranties page table uses order business labels instead of order technical id", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /getWarrantyOrderLabel/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

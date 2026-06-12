import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("rebates page uses business selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /const rebateOrderOptions =/);
  assert.match(pageSource, /const rebateOptions =/);
  assert.match(pageSource, /placeholder="选择返利订单"/);
  assert.match(pageSource, /options=\{rebateOrderOptions\}/);
  assert.match(pageSource, /placeholder="选择返利申请"/);
  assert.match(pageSource, /options=\{rebateOptions\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="返利 ID"/);
});

test("rebates page table uses business labels instead of technical id columns", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /getRebateBusinessLabel/);
  assert.match(pageSource, /getRebateOrderLabel/);
  assert.doesNotMatch(pageSource, /title: "返利 ID"/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

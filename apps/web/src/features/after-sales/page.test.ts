import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("after-sales page records penalty money in yuan and submits cents to API", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /penaltyAmountYuan\?: number/);
  assert.match(pageSource, /name="penaltyAmountYuan"/);
  assert.match(pageSource, /处罚金额（元）/);
  assert.match(pageSource, /penaltyAmountCents: yuanToCents\(values\.penaltyAmountYuan\)/);
  assert.doesNotMatch(pageSource, /name="penaltyAmountCents"/);
  assert.doesNotMatch(pageSource, /处罚分/);
});

test("after-sales page creates after-sale requests by selecting an order", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /const orderOptions =/);
  assert.match(pageSource, /<Select[\s\S]*placeholder="选择订单"/);
  assert.match(pageSource, /options=\{orderOptions\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
});

test("after-sales page assigns and judges by selecting after-sales and workers", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /constructionApi\.workers\(storeId!\)/);
  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const afterSaleOptions =/);
  assert.match(pageSource, /const workerOptions =/);
  assert.match(pageSource, /mode="multiple"[\s\S]*options=\{workerOptions\}/);
  assert.match(pageSource, /name="penaltyWorkerUserId"[\s\S]*options=\{workerOptions\}/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="售后 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="施工人员 ID/);
  assert.doesNotMatch(pageSource, /<Input placeholder="处罚人员 ID"/);
});

test("after-sales page table uses business labels instead of technical id columns", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /getAfterSaleBusinessLabel/);
  assert.match(pageSource, /getAfterSaleOrderLabel/);
  assert.doesNotMatch(pageSource, /title: "售后 ID"/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

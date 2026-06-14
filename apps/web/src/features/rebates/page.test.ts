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

test("rebates page follows the prototype review workspace layout", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /rebate-tabs/);
  assert.match(pageSource, /rebate-rules-card/);
  assert.match(pageSource, /rebate-workspace/);
  assert.match(pageSource, /rebate-application-list/);
  assert.match(pageSource, /rebate-review-panel/);
  assert.match(pageSource, /rebate-application-drawer/);
  assert.match(pageSource, /返利申请列表/);
  assert.match(pageSource, /审核详情/);
  assert.match(pageSource, /发放操作预设/);
  assert.match(pageSource, /提交返利申请/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /rebate-apply-card/);
});

test("rebates page combines review and payout actions in one side panel", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /selectedRebateId/);
  assert.match(pageSource, /rebateActionForm/);
  assert.match(pageSource, /期望发放方式/);
  assert.match(pageSource, /审核通过/);
  assert.match(pageSource, /发放返利/);
  assert.doesNotMatch(pageSource, /operation-action-grid/);
});

test("rebates page derives the active rebate without sync setState effects", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /const rebateRows = useMemo\(\(\) => rebatesQuery\.data \?\? \[\], \[rebatesQuery\.data\]\);/);
  assert.match(pageSource, /const activeRebateId = selectedRebateId \?\? rebateRows\[0\]\?\.id;/);
  assert.match(pageSource, /rebateRows\.find\(\(rebate\) => rebate\.id === activeRebateId\)/);
  assert.doesNotMatch(pageSource, /setSelectedRebateId\(rebateRows\[0\]\.id\)/);
});

test("rebates page uses mobile rebate cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /rebate-mobile-cards/);
  assert.match(pageSource, /rebate-mobile-card/);
  assert.match(pageSource, /rebate-desktop-table/);
  assert.match(cssSource, /\.rebate-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.rebate-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.rebate-mobile-cards\s*\{[\s\S]*display: grid;/);
});

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

test("warranties page follows the prototype warranty management workspace", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /warranty-command-bar/);
  assert.match(pageSource, /warranty-filter-panel/);
  assert.match(pageSource, /warranty-workspace/);
  assert.match(pageSource, /warranty-record-list/);
  assert.match(pageSource, /warranty-support-grid/);
  assert.match(pageSource, /warranty-registration-panel/);
  assert.match(pageSource, /warranty-preview-panel/);
  assert.match(pageSource, /scroll=\{\{ x: 980 \}\}/);
  assert.match(pageSource, /质保订单列表/);
  assert.match(pageSource, /电子质保卡预览/);
  assert.doesNotMatch(pageSource, /warranty-action-layout/);
});

test("warranties page keeps lookup registration and guidance inside the prototype workspace", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /warranty-guide-grid/);
  assert.match(pageSource, /warranty-card-preview/);
  assert.match(pageSource, /生成电子质保/);
  assert.match(pageSource, /质保编号查询/);
  assert.match(pageSource, /质保审核指南/);
  assert.match(pageSource, /电子质保卡上线/);
});

test("warranties workspace constrains wide tables inside the page canvas", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /\.warranty-record-list\.ant-card[\s\S]*min-width: 0/);
  assert.match(cssSource, /\.warranty-record-list \.ant-card-body[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.warranty-guide-grid[\s\S]*max-width: 100%/);
});

test("warranties page uses mobile warranty cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /warranty-mobile-cards/);
  assert.match(pageSource, /warranty-mobile-card/);
  assert.match(pageSource, /warranty-desktop-table/);
  assert.match(cssSource, /\.warranty-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.warranty-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.warranty-mobile-cards\s*\{[\s\S]*display: grid;/);
});

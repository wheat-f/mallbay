import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("warranties home uses warranty cards as the primary list", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /title="质保管理"/);
  assert.match(pageSource, /title="质保卡列表"/);
  assert.match(pageSource, /warrantiesApi\.list\(storeId!\)/);
  assert.match(pageSource, /orderApi\.list\(\{ storeId: storeId!, status: "IN_CONSTRUCTION", page: 1, pageSize: 100 \}\)/);
  assert.match(pageSource, /warrantyStatusFilter/);
  assert.match(pageSource, /质保状态/);
  assert.match(pageSource, /质保编号 \/ 订单号 \/ 客户 \/ 车牌 \/ 范围/);
  assert.doesNotMatch(pageSource, /title="工单列表"/);
  assert.doesNotMatch(pageSource, /<Form/);
  assert.doesNotMatch(pageSource, /系统自动提取信息 \(来自工单\)/);
});

test("warranties home routes pending delivery orders back to lifecycle detail", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /function renderWarrantyCardAction/);
  assert.match(pageSource, /function renderPendingWarrantyOrder/);
  assert.match(pageSource, /pendingDeliveryRows/);
  assert.match(pageSource, /待最终交付工单/);
  assert.match(pageSource, /查看电子质保/);
  assert.match(pageSource, /router\.push\(`\/warranties\/\$\{row\.id\}`\)/);
  assert.match(pageSource, /待最终交付/);
  assert.match(pageSource, /router\.push\(`\/orders\/\$\{row\.id\}`\)/);
  assert.match(pageSource, /warrantyByOrderId/);
});

test("warranties home does not expose an independent warranty creation route", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");
  assert.doesNotMatch(pageSource, /warranties\/create/);
  assert.doesNotMatch(pageSource, /生成电子质保/);
  assert.match(pageSource, /最终交付事务中形成或激活/);
});

test("warranties pages keep the responsive workspace classes", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /warranty-command-bar/);
  assert.match(pageSource, /warranty-filter-panel/);
  assert.match(pageSource, /warranty-workspace-list/);
  assert.match(pageSource, /warranty-mobile-cards/);
  assert.match(pageSource, /warranty-desktop-table/);
  assert.match(cssSource, /\.warranty-workspace-list/);
  assert.match(cssSource, /\.warranty-table-count/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.warranty-mobile-cards \{\r?\n\s{4}display: grid;/);
});

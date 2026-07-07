import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("warranties home is a work-order list instead of an inline registration form", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /title="质保管理"/);
  assert.match(pageSource, /title="工单列表"/);
  assert.match(pageSource, /orderApi\.list\(\{ storeId: storeId!, page: 1, pageSize: 100 \}\)/);
  assert.match(pageSource, /statusFilter/);
  assert.match(pageSource, /工单状态/);
  assert.match(pageSource, /订单号 \/ 客户 \/ 车牌/);
  assert.doesNotMatch(pageSource, /<Form/);
  assert.doesNotMatch(pageSource, /系统自动提取信息 \(来自工单\)/);
});

test("warranties home shows warranty actions only when business state allows it", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /function renderWarrantyAction/);
  assert.match(pageSource, /row\.warranty/);
  assert.match(pageSource, /查看电子质保/);
  assert.match(pageSource, /row\.status === "COMPLETED"/);
  assert.match(pageSource, /生成电子质保/);
  assert.match(pageSource, /return null/);
  assert.match(pageSource, /warrantyByOrderId/);
});

test("warranties create page selects completed orders and previews extracted order data", () => {
  const createPath = "app/warranties/create/page.tsx";
  assert.equal(existsSync(createPath), true);

  const pageSource = readFileSync(createPath, "utf8");

  assert.match(pageSource, /status: "COMPLETED"/);
  assert.match(pageSource, /placeholder="选择已完工工单"/);
  assert.match(pageSource, /系统自动提取信息 \(来自工单\)/);
  assert.match(pageSource, /客户姓名/);
  assert.match(pageSource, /联系电话/);
  assert.match(pageSource, /车架号 VIN/);
  assert.match(pageSource, /订单接口未返回联系电话/);
  assert.match(pageSource, /车辆档案未返回 VIN/);
  assert.match(pageSource, /提交生成质保/);
  assert.match(pageSource, /router\.push\(`\/warranties\/\$\{created\.id\}`\)/);
});

test("warranties pages keep the responsive workspace classes", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");
  const createSource = readFileSync("app/warranties/create/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /warranty-command-bar/);
  assert.match(pageSource, /warranty-filter-panel/);
  assert.match(pageSource, /warranty-workspace-list/);
  assert.match(pageSource, /warranty-mobile-cards/);
  assert.match(pageSource, /warranty-desktop-table/);
  assert.match(createSource, /warranty-create-page/);
  assert.match(cssSource, /\.warranty-workspace-list/);
  assert.match(cssSource, /\.warranty-table-count/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.warranty-mobile-cards \{\r?\n\s{4}display: grid;/);
});

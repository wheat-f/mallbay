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
  assert.doesNotMatch(pageSource, /order\.orderNo \?\? order\.id/);
  assert.match(pageSource, /order\.orderNo \?\? "未编号订单"/);
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
  assert.match(pageSource, /已完工待质保订单/);
  assert.match(pageSource, /电子质保卡预览/);
  assert.doesNotMatch(pageSource, /warranty-action-layout/);
});

test("warranties page keeps lookup registration and guidance inside the prototype workspace", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /warranty-guide-grid/);
  assert.match(pageSource, /warranty-card-preview/);
  assert.match(pageSource, /<span>mallbay<\/span>/);
  assert.doesNotMatch(pageSource, /MallBay Warranty/);
  assert.match(pageSource, /生成或查询后显示客户、车辆和施工范围/);
  assert.doesNotMatch(pageSource, /将在生成或查询后展示/);
  assert.match(pageSource, /生成电子质保/);
  assert.match(pageSource, /质保编号查询/);
  assert.match(pageSource, /质保审核指南/);
  assert.match(pageSource, /电子质保卡上线/);
});

test("warranties search placeholder uses business fields instead of technical ids", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /placeholder="质保编号 \/ 客户 \/ 车牌 \/ VIN"/);
  assert.doesNotMatch(pageSource, /质保ID/);
});

test("warranties status filters use prototype status wording", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /\{ value: "ACTIVE", label: "生效中" \}/);
  assert.doesNotMatch(pageSource, /\{ value: "ACTIVE", label: "有效" \}/);
});

test("warranties page formats warranty dates with business-safe fallback", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /function formatWarrantyDate/);
  assert.match(pageSource, /质保日期待确认/);
  assert.match(pageSource, /render: \(_, row\) => formatWarrantyDate\(row\.startDate\)/);
  assert.match(pageSource, /render: \(_, row\) => formatWarrantyDate\(row\.endDate\)/);
  assert.doesNotMatch(pageSource, /row\.(startDate|endDate)\?\.slice\(0, 10\)/);
  assert.doesNotMatch(pageSource, /return value\?\.slice\(0, 10\) \?\? "-"/);
});

test("warranties page matches the prototype registration desk vocabulary", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /title="质保登记台"/);
  assert.match(pageSource, /已完工待质保订单/);
  assert.match(pageSource, /系统自动提取信息 \(来自工单\)/);
  assert.match(pageSource, /客户姓名/);
  assert.match(pageSource, /联系电话/);
  assert.match(pageSource, /车架号 VIN/);
  assert.match(pageSource, /质保参数配置/);
  assert.match(pageSource, /质保编号 \(系统生成\)/);
  assert.match(pageSource, /产品型号 \(自动匹配\)/);
  assert.match(pageSource, /质保年限/);
  assert.match(pageSource, /质保到期日期 \(自动计算\)/);
  assert.match(pageSource, /质保范围 \(依据厂家标准\)/);
  assert.match(pageSource, /提交生成质保/);
  assert.match(pageSource, /下载电子质保卡/);
});

test("warranties registration desk includes archived photo proof slots from the prototype", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /warranty-proof-grid/);
  assert.match(pageSource, /膜桶标签照片 \(自动归档\)/);
  assert.match(pageSource, /完工车辆照片 \(自动归档\)/);
  assert.match(pageSource, /扫码核验膜卷批次、序列号和施工记录/);
});

test("warranties archived photo proof slots stack after the base grid rule on mobile", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");
  const baseGridRuleIndex = cssSource.indexOf(".warranty-proof-grid {\n  display: grid;");
  const mobileGridRuleIndex = cssSource.indexOf("@media (max-width: 900px) {\n  .warranty-proof-grid {\n    grid-template-columns: minmax(0, 1fr);");

  assert.ok(baseGridRuleIndex > 0);
  assert.ok(mobileGridRuleIndex > baseGridRuleIndex);
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
  assert.match(cssSource, /@media \(max-width: 900px\) \{\n\s{2}\.warranty-desktop-table \{\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.warranty-mobile-cards \{\n\s{4}display: grid;/);
});

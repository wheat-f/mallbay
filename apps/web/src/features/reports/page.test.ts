import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("reports page exposes construction delivery trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildConstructionTrendRows/);
  assert.match(source, /constructionTrendRows/);
  assert.match(source, /施工趋势/);
  assert.match(source, /完工率/);
  assert.match(source, /返工/);
});

test("reports page renders only one workbench return header", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");
  const headerUsages = source.match(/<StorePageHeader/g) ?? [];

  assert.equal(headerUsages.length, 1);
});

test("reports page allows auditors to load all-store reports without a store member", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /user\?\.isAuditor/);
  assert.match(source, /enabled: Boolean\(storeId\) \|\| Boolean\(user\?\.isAuditor\)/);
  assert.match(source, /reportsApi\.summary\(storeId\)/);
});

test("reports page renders sales users as personal performance instead of store operation report", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /const isSalesReport = user\?\.storeMember\?\.position === "SALES"/);
  assert.match(source, /title=\{isSalesReport \? "我的业绩" : "分析报表中心"\}/);
  assert.match(source, /description=\{isSalesReport \? "查看自己的订单、回款、发票、返利和销售提成" : "销售、收款、施工、售后、发票和返利的门店经营分析"\}/);
  assert.match(source, /buildSalesPerformanceRows\(summary\)/);
  assert.match(source, /buildSalesPerformanceInsightRows\(summary\)/);
});

test("reports page hides store operation trend sections for sales performance view", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /isSalesReport \? SALES_REPORT_TABS : STORE_REPORT_TABS/);
  assert.match(source, /isSalesReport \? \(/);
  assert.doesNotMatch(source, /dashboard-shell/);
  assert.doesNotMatch(source, /dashboard-content/);
  assert.match(source, /我的销售提成/);
  assert.match(source, /销售提成金额/);
});

test("reports page follows prototype report-center layout", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /reports-filter-card/);
  assert.match(source, /reports-tabs/);
  assert.match(source, /分析与建议 \(AI 洞察\)/);
  assert.match(source, /reports-bento-grid/);
  assert.match(source, /销售趋势分析/);
  assert.match(source, /按施工类型统计/);
  assert.match(source, /reports-detail-card/);
  assert.match(source, /导出数据/);
});

test("reports page uses mobile cards instead of dense report tables on small screens", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const tableViewCount = source.match(/<ReportDataView/g)?.length ?? 0;
  const rawTableCount = source.match(/<Table</g)?.length ?? 0;
  const baseHiddenIndex = cssSource.indexOf(".reports-data-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".reports-data-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".reports-data-mobile-cards", desktopTableIndex);

  assert.match(source, /function ReportDataView/);
  assert.match(source, /reports-data-mobile-cards/);
  assert.match(source, /reports-data-mobile-card/);
  assert.match(source, /reports-data-desktop-table/);
  assert.equal(tableViewCount, 12);
  assert.equal(rawTableCount, 1);
  assert.match(cssSource, /\.reports-data-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.reports-data-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.reports-data-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.ok(baseHiddenIndex >= 0, "base hidden rule must exist");
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});

test("reports page exposes after-sale trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildAfterSaleTrendRows/);
  assert.match(source, /afterSaleTrendRows/);
  assert.match(source, /售后趋势/);
  assert.match(source, /解决率/);
  assert.match(source, /施工责任/);
});

test("reports page exposes commission trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildCommissionTrendRows/);
  assert.match(source, /commissionTrendRows/);
  assert.match(source, /提成趋势/);
  assert.match(source, /销售提成/);
  assert.match(source, /师傅提成/);
  assert.match(source, /调整/);
});

test("reports page exposes finance trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildFinanceTrendRows/);
  assert.match(source, /financeTrendRows/);
  assert.match(source, /财务趋势/);
  assert.match(source, /净现金流/);
  assert.match(source, /返利/);
});

test("reports page exposes inventory trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildInventoryTrendRows/);
  assert.match(source, /inventoryTrendRows/);
  assert.match(source, /库存趋势/);
  assert.match(source, /入库/);
  assert.match(source, /调整/);
});

test("reports page exposes invoice trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildInvoiceTrendRows/);
  assert.match(source, /invoiceTrendRows/);
  assert.match(source, /发票趋势/);
  assert.match(source, /开票率/);
  assert.match(source, /已重开/);
});

test("reports page exposes rebate trend table", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /buildRebateTrendRows/);
  assert.match(source, /rebateTrendRows/);
  assert.match(source, /返利趋势/);
  assert.match(source, /发放率/);
  assert.match(source, /已驳回/);
});

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
  assert.match(source, /title=\{isSalesReport \? "我的业绩" : "经营报表"\}/);
  assert.match(source, /description=\{isSalesReport \? "查看自己的订单、回款、发票、返利和销售提成" : "销售、收款、施工、售后、发票和返利的门店经营汇总"\}/);
  assert.match(source, /buildSalesPerformanceRows\(summary\)/);
  assert.match(source, /buildSalesPerformanceInsightRows\(summary\)/);
});

test("reports page hides store operation trend sections for sales performance view", () => {
  const source = readFileSync("app/reports/page.tsx", "utf8");

  assert.match(source, /if \(isSalesReport\) \{/);
  assert.match(source, /return \(\s*<Layout/);
  assert.match(source, /title="我的销售提成"/);
  assert.match(source, /销售提成金额/);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/reports/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");

test("reports page exposes construction delivery trend table", () => {
  assert.match(source, /buildConstructionTrendRows/);
  assert.match(source, /constructionTrendRows/);
  assert.match(source, /施工趋势/);
  assert.match(source, /完工率/);
  assert.match(source, /返工/);
});

test("reports page renders only one workbench return header", () => {
  const headerUsages = source.match(/<StorePageHeader/g) ?? [];

  assert.equal(headerUsages.length, 1);
});

test("reports page allows auditors to load all-store reports without a store member", () => {
  assert.match(source, /user\?\.isAuditor/);
  assert.match(source, /enabled: Boolean\(storeId\) \|\| Boolean\(user\?\.isAuditor\)/);
  assert.match(source, /reportsApi\.summary\(storeId\)/);
});

test("reports page renders sales users as personal performance instead of store operation report", () => {
  assert.match(source, /const isSalesReport = user\?\.storeMember\?\.position === "SALES"/);
  assert.match(source, /title=\{isSalesReport \? "我的业绩" : "分析报表中心"\}/);
  assert.match(source, /description=\{isSalesReport \? "查看自己的订单、回款、发票、返利和销售提成" : undefined\}/);
  assert.doesNotMatch(source, /销售、收款、施工、售后、发票和返利的门店经营分析/);
  assert.match(source, /buildSalesPerformanceRows\(summary\)/);
  assert.match(source, /buildSalesPerformanceInsightRows\(summary\)/);
});

test("reports page hides store operation trend sections for sales performance view", () => {
  assert.match(source, /isSalesReport \? SALES_REPORT_TABS : STORE_REPORT_TABS/);
  assert.match(source, /isSalesReport \? \(/);
  assert.doesNotMatch(source, /dashboard-shell/);
  assert.doesNotMatch(source, /dashboard-content/);
  assert.match(source, /我的销售提成/);
  assert.match(source, /销售提成金额/);
});

test("reports page follows prototype report-center layout", () => {
  assert.match(source, /reports-search-box/);
  assert.match(source, /placeholder="搜索报表、数据或人员\.\.\."/);
  assert.match(source, /reports-filter-card/);
  assert.match(source, /reports-tabs/);
  assert.match(source, /分析与建议 \(AI 洞察\)/);
  assert.match(source, /reports-bento-grid/);
  assert.match(source, /销售趋势分析/);
  assert.match(source, /按施工类型统计/);
  assert.match(source, /reports-detail-card/);
  assert.match(source, /title=\{isSalesReport \? "我的业绩指标明细" : "销售订单明细"\}/);
  assert.doesNotMatch(source, /经营指标明细/);
  assert.match(source, /导出数据/);
});

test("reports global filters use prototype business dimensions", () => {
  assert.match(source, /日期范围/);
  assert.match(source, /自定义范围\.\.\./);
  assert.match(source, /销售人员/);
  assert.match(source, /施工人员/);
  assert.match(source, /施工类型/);
  assert.match(source, /产品型号/);
  assert.match(source, /订单状态/);
  assert.match(source, /全车隐形车衣/);
  assert.match(source, /局部贴膜/);
  assert.match(source, /改色膜/);
  assert.match(source, /玻璃隔热膜/);
  assert.match(source, /Pro系列 V10/);
  assert.match(source, /Elite系列 X8/);
  assert.match(source, /Classic系列 C5/);
  assert.match(source, /已交车/);
  assert.match(source, /售后中/);
  assert.doesNotMatch(source, /value: "待派单"/);
  assert.doesNotMatch(source, /value: "PPF"/);
  assert.doesNotMatch(source, /value: "复检"/);
});

test("reports tabs jump to the matching report sections", () => {
  assert.match(source, /REPORT_TAB_TARGETS/);
  assert.match(source, /reportSectionRefs/);
  assert.match(source, /scrollReportSectionIntoView/);
  assert.match(source, /activeReportTabKey/);
  assert.match(source, /ref=\{salesTrendSectionRef\}/);
  assert.match(source, /ref=\{commissionTrendSectionRef\}/);
  assert.match(source, /ref=\{constructionTrendSectionRef\}/);
  assert.match(source, /ref=\{financeTrendSectionRef\}/);
  assert.match(source, /aria-selected=\{activeReportTabKey === tabItem\.key\}/);
  assert.match(source, /onClick=\{\(\) => scrollReportSectionIntoView\(tabItem\.key\)\}/);
  assert.doesNotMatch(source, /tabs\.map\(\(tabItem, index\)/);
  assert.doesNotMatch(source, /aria-selected=\{index === 0\}/);
});

test("reports tabs stay fixed and visible after jumping to report modules", () => {
  assert.match(source, /reports-tabs-sticky/);
  assert.match(source, /const REPORT_TAB_STICKY_OFFSET =/);
  assert.match(source, /targetTop - REPORT_TAB_STICKY_OFFSET/);
  assert.match(cssSource, /\.reports-tabs-sticky\s*\{[\s\S]*position: sticky;/);
  assert.match(cssSource, /\.reports-tabs-sticky\s*\{[\s\S]*top: 72px;/);
  assert.match(cssSource, /\.reports-tabs-sticky\s*\{[\s\S]*z-index: 30;/);
  assert.match(cssSource, /\.report-section\s*\{[\s\S]*scroll-margin-top: 148px;/);
});

test("reports page uses mobile cards instead of dense report tables on small screens", () => {
  const tableViewCount = source.match(/<ReportDataView/g)?.length ?? 0;
  const rawTableCount = source.match(/<Table</g)?.length ?? 0;
  const baseHiddenIndex = cssSource.indexOf(".reports-data-mobile-cards {\n  display: none");
  const tabsDisplayIndex = cssSource.indexOf(".reports-tabs {\n    display: grid");
  const desktopTableIndex = cssSource.indexOf(".reports-data-desktop-table", tabsDisplayIndex);
  const mobileDisplayIndex = cssSource.indexOf(".reports-data-mobile-cards", desktopTableIndex);
  const mediaStartIndex = cssSource.lastIndexOf("@media", desktopTableIndex);
  const mediaHeader = cssSource.slice(mediaStartIndex, cssSource.indexOf("{", mediaStartIndex) + 1);

  assert.match(source, /function ReportDataView/);
  assert.match(source, /reports-data-mobile-cards/);
  assert.match(source, /reports-data-mobile-card/);
  assert.match(source, /reports-data-desktop-table/);
  assert.equal(tableViewCount, 12);
  assert.equal(rawTableCount, 1);
  assert.match(cssSource, /\.reports-data-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.equal(mediaHeader, "@media (max-width: 900px) {");
  assert.match(cssSource.slice(mediaStartIndex, desktopTableIndex + 130), /\.reports-data-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource.slice(mediaStartIndex, cssSource.indexOf(".reports-data-mobile-fields", mediaStartIndex)), /\.reports-data-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.ok(baseHiddenIndex >= 0, "base hidden rule must exist");
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});

test("reports page converts report tabs to a visible mobile grid", () => {
  const tabsIndex = cssSource.indexOf(".reports-tabs {\n    display: grid");
  const mediaStartIndex = cssSource.lastIndexOf("@media", tabsIndex);
  const mediaHeader = cssSource.slice(mediaStartIndex, cssSource.indexOf("{", mediaStartIndex) + 1);
  const mobileCss = cssSource.slice(mediaStartIndex, cssSource.indexOf(".reports-data-mobile-fields", mediaStartIndex));

  assert.equal(mediaHeader, "@media (max-width: 900px) {");
  assert.match(mobileCss, /\.reports-tabs\s*\{[\s\S]*display: grid;/);
  assert.match(mobileCss, /\.reports-tabs\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(mobileCss, /\.reports-tabs\s*\{[\s\S]*overflow-x: visible;/);
  assert.match(mobileCss, /\.reports-tabs button\s*\{[\s\S]*white-space: normal;/);
});

test("reports trend tables keep a readable desktop width instead of squeezing columns", () => {
  assert.match(cssSource, /\.reports-trend-grid\s*\{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 520px\), 1fr\)\);/);
  assert.match(cssSource, /\.report-section\s*\{[\s\S]*overflow: hidden;/);
  assert.match(cssSource, /\.reports-data-desktop-table \.ant-table\s*\{[\s\S]*min-width: 560px;/);
});

test("reports insight card uses compact cards instead of a squeezed mini table", () => {
  assert.match(source, /reports-chart-card reports-insight-card/);
  assert.match(cssSource, /\.reports-insight-card\s*\{[\s\S]*grid-column: span 2;/);
  assert.match(cssSource, /\.reports-insight-card \.reports-data-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(
    cssSource,
    /\.reports-insight-card \.reports-data-mobile-cards\s*\{\n\s{2}display: grid;\n\s{2}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    cssSource,
    /@media \(max-width: 760px\)[\s\S]*\.reports-insight-card \.reports-data-mobile-cards\s*\{\n\s{4}grid-template-columns: minmax\(0, 1fr\);/
  );
});

test("reports page exposes after-sale trend table", () => {
  assert.match(source, /buildAfterSaleTrendRows/);
  assert.match(source, /afterSaleTrendRows/);
  assert.match(source, /售后趋势/);
  assert.match(source, /已完成/);
  assert.match(source, /完成率/);
  assert.doesNotMatch(source, /已解决/);
  assert.doesNotMatch(source, /解决率/);
  assert.match(source, /施工责任/);
});

test("reports page exposes commission trend table", () => {
  assert.match(source, /buildCommissionTrendRows/);
  assert.match(source, /commissionTrendRows/);
  assert.match(source, /提成趋势/);
  assert.match(source, /销售提成/);
  assert.match(source, /师傅提成/);
  assert.match(source, /调整/);
});

test("reports page exposes finance trend table", () => {
  assert.match(source, /buildFinanceTrendRows/);
  assert.match(source, /financeTrendRows/);
  assert.match(source, /财务趋势/);
  assert.match(source, /净现金流/);
  assert.match(source, /返利/);
});

test("reports page exposes inventory trend table", () => {
  assert.match(source, /buildInventoryTrendRows/);
  assert.match(source, /inventoryTrendRows/);
  assert.match(source, /库存趋势/);
  assert.match(source, /入库/);
  assert.match(source, /调整/);
});

test("reports page exposes invoice trend table", () => {
  assert.match(source, /buildInvoiceTrendRows/);
  assert.match(source, /invoiceTrendRows/);
  assert.match(source, /发票趋势/);
  assert.match(source, /开票率/);
  assert.match(source, /已开票/);
  assert.match(source, /重新开票/);
  assert.doesNotMatch(source, /已开具/);
  assert.doesNotMatch(source, /已重开/);
});

test("reports page exposes rebate trend table", () => {
  assert.match(source, /buildRebateTrendRows/);
  assert.match(source, /rebateTrendRows/);
  assert.match(source, /返利趋势/);
  assert.match(source, /发放率/);
  assert.match(source, /已驳回/);
});

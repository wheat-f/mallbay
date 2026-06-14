import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("commissions page uses business selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /constructionApi\.assignments\(\{/);
  assert.match(pageSource, /constructionApi\.workers\(storeId!\)/);
  assert.match(pageSource, /getCommissionRuleTypeLabel/);
  assert.match(pageSource, /getConstructionStatusLabel/);
  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const commissionOrderOptions =/);
  assert.match(pageSource, /const constructionRecordOptions =/);
  assert.match(pageSource, /const workerOptions =/);
  assert.match(pageSource, /placeholder="选择销售提成订单"/);
  assert.match(pageSource, /options=\{commissionOrderOptions\}/);
  assert.match(pageSource, /placeholder="选择施工记录"/);
  assert.match(pageSource, /options=\{constructionRecordOptions\}/);
  assert.match(pageSource, /placeholder="选择调整人员"/);
  assert.match(pageSource, /options=\{workerOptions\}/);
  assert.match(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /dataIndex: "ruleType"/);
  assert.doesNotMatch(pageSource, /record\.status\]\.filter/);
  assert.doesNotMatch(pageSource, /order\.orderNo \?\? order\.id/);
  assert.doesNotMatch(pageSource, /record\.order\?\.orderNo \?\? record\.orderId/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="施工记录 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="调整人员 ID"/);
});

test("commissions page exposes settlement source summary without fake settled records", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /const settlementRows =/);
  assert.match(pageSource, /规则配置/);
  assert.match(pageSource, /销售提成/);
  assert.match(pageSource, /师傅提成/);
  assert.match(pageSource, /title="结算日志明细"/);
  assert.match(pageSource, /当前版本展示可结算来源，不伪造已结算流水/);
  assert.doesNotMatch(pageSource, /可结算订单", commissionOrderOptions/);
});

test("commissions page follows the prototype commission rule workspace layout", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /title="佣金规则配置"/);
  assert.match(pageSource, /commission-page-actions/);
  assert.match(pageSource, /commission-rule-tabs/);
  assert.match(pageSource, /commission-workspace/);
  assert.match(pageSource, /commission-rule-bento/);
  assert.match(pageSource, /commission-sales-panel/);
  assert.match(pageSource, /commission-worker-panel/);
  assert.match(pageSource, /全局规则应用/);
  assert.match(pageSource, /销售佣金规则/);
  assert.match(pageSource, /施工员佣金规则/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /warranty-action-layout/);
});

test("commissions page keeps generation and settlement actions in the prototype workspace", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /commission-generation-panel/);
  assert.match(pageSource, /commission-settlement-panel/);
  assert.match(pageSource, /commission-sync-footer/);
  assert.match(pageSource, /生成销售提成/);
  assert.match(pageSource, /生成师傅提成/);
  assert.match(pageSource, /结算日志明细/);
  assert.match(pageSource, /规则只影响后续生成，不回写历史提成快照/);
});

test("commissions page links to the prototype settlement workspace", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /\/commissions\/settlements/);
  assert.match(pageSource, /提成结算/);
});

test("commissions page uses mobile cards for rule and settlement tables", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /commission-rule-mobile-cards/);
  assert.match(pageSource, /commission-rule-mobile-card/);
  assert.match(pageSource, /commission-rule-desktop-table/);
  assert.match(pageSource, /commission-settlement-mobile-cards/);
  assert.match(pageSource, /commission-settlement-mobile-card/);
  assert.match(pageSource, /commission-settlement-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.commission-rule-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.commission-rule-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.commission-settlement-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.commission-settlement-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("commission settlement page follows the prototype settlement layout without fake records", () => {
  const pagePath = "app/commissions/settlements/page.tsx";

  assert.equal(existsSync(pagePath), true);

  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /提成结算日志/);
  assert.match(pageSource, /待结算提成/);
  assert.match(pageSource, /本月应发提成总额/);
  assert.match(pageSource, /待审核总额/);
  assert.match(pageSource, /已发放总额/);
  assert.match(pageSource, /角色类型/);
  assert.match(pageSource, /结算月份/);
  assert.match(pageSource, /单据状态/);
  assert.match(pageSource, /结算日志明细/);
  assert.match(pageSource, /生成本月结算单/);
  assert.match(pageSource, /导出报表/);
  assert.match(pageSource, /当前版本展示可结算来源，不伪造已结算流水/);
  assert.match(pageSource, /commission-settlement-page/);
  assert.match(pageSource, /commission-settlement-tabs/);
  assert.match(pageSource, /commission-settlement-kpi-grid/);
  assert.match(pageSource, /commission-settlement-filter/);
  assert.match(pageSource, /commission-settlement-table/);
  assert.match(pageSource, /commission-settlement-queue/);
  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /constructionApi\.assignments\(\{/);
  assert.doesNotMatch(pageSource, /SET-202310/);
  assert.doesNotMatch(pageSource, /张伟/);
  assert.doesNotMatch(pageSource, /李思明/);
  assert.doesNotMatch(pageSource, /王志强/);

  assert.match(cssSource, /\.commission-settlement-page/);
  assert.match(cssSource, /\.commission-settlement-tabs/);
  assert.match(cssSource, /\.commission-settlement-kpi-grid/);
  assert.match(cssSource, /\.commission-settlement-filter/);
  assert.match(cssSource, /\.commission-settlement-table/);
  assert.match(cssSource, /\.commission-settlement-queue/);
});

test("commission settlement page uses mobile cards for settlement logs", () => {
  const pageSource = readFileSync("app/commissions/settlements/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /commission-settlement-log-mobile-cards/);
  assert.match(pageSource, /commission-settlement-log-mobile-card/);
  assert.match(pageSource, /commission-settlement-log-desktop-table/);
  assert.match(cssSource, /\.commission-settlement-log-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.commission-settlement-log-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.commission-settlement-log-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("commission settlement page stacks KPI filters and queues on mobile", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");
  const markerIndex = cssSource.indexOf(".commission-settlement-log-desktop-table");
  const mobileCss = cssSource.slice(
    cssSource.lastIndexOf("@media (max-width: 720px)", markerIndex),
    cssSource.indexOf("@media (min-width: 768px)", markerIndex)
  );

  assert.match(mobileCss, /\.commission-settlement-kpi-grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(mobileCss, /\.commission-settlement-filter-grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(mobileCss, /\.commission-settlement-filter-actions\s*\{[\s\S]*display: grid;/);
  assert.match(mobileCss, /\.commission-settlement-queue\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

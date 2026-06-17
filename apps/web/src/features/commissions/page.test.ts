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
  assert.match(pageSource, /订单信息待确认/);
  assert.doesNotMatch(pageSource, /订单未加载/);
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
  assert.match(pageSource, /按生成记录核对结算周期、岗位和实发金额/);
  assert.doesNotMatch(pageSource, /当前版本展示可结算来源，不伪造已结算流水/);
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
  assert.match(pageSource, /一键同步配置到所有门店或指定销售组/);
  assert.match(pageSource, /销售佣金规则/);
  assert.match(pageSource, /施工员佣金规则/);
  assert.doesNotMatch(pageSource, /一键同步配置到当前门店销售组、施工组和财务结算流程。/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /warranty-action-layout/);
});

test("commissions rule tabs jump to the matching rule panels", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /COMMISSION_RULE_TABS/);
  assert.match(pageSource, /commissionRuleSectionRefs/);
  assert.match(pageSource, /scrollCommissionRuleSectionIntoView/);
  assert.match(pageSource, /activeCommissionRuleTab/);
  assert.match(pageSource, /ref=\{salesCommissionRuleSectionRef\}/);
  assert.match(pageSource, /ref=\{workerCommissionRuleSectionRef\}/);
  assert.match(pageSource, /aria-selected=\{activeCommissionRuleTab === item\.key\}/);
  assert.match(pageSource, /onClick=\{\(\) => scrollCommissionRuleSectionIntoView\(item\.key\)\}/);
  assert.doesNotMatch(pageSource, /<button className="is-active" type="button">\s*销售佣金规则/);
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

test("commissions page explains rate fields without BP abbreviations", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /佣金比例（万分比）/);
  assert.match(pageSource, /比例（万分比）/);
  assert.doesNotMatch(pageSource, /佣金比例 BP/);
  assert.doesNotMatch(pageSource, /比例 BP/);
});

test("commissions page avoids implementation-phase export copy", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /请先确认结算明细后再导出报表/);
  assert.doesNotMatch(pageSource, /提成结算导出将在后续财务批次中实现/);
});

test("commissions page avoids implementation-phase global sync copy", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /请先确认规则适用范围后再同步到相关小组/);
  assert.match(pageSource, /操作日志会统一进入审计中心/);
  assert.doesNotMatch(pageSource, /规则同步将在多门店配置批次中实现/);
  assert.doesNotMatch(pageSource, /操作日志将在审计中心统一展示/);
});

test("commissions page links to the prototype settlement workspace", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /\/commissions\/settlements/);
  assert.match(pageSource, /提成结算/);
});

test("commissions page uses mobile cards for rule and settlement tables", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const ruleDesktopIndex = cssSource.indexOf(".commission-rule-desktop-table");
  const settlementDesktopIndex = cssSource.indexOf(".commission-settlement-desktop-table");
  const ruleMediaStart = cssSource.lastIndexOf("@media", ruleDesktopIndex);
  const settlementMediaStart = cssSource.lastIndexOf("@media", settlementDesktopIndex);

  assert.match(pageSource, /commission-rule-mobile-cards/);
  assert.match(pageSource, /commission-rule-mobile-card/);
  assert.match(pageSource, /commission-rule-desktop-table/);
  assert.match(pageSource, /commission-settlement-mobile-cards/);
  assert.match(pageSource, /commission-settlement-mobile-card/);
  assert.match(pageSource, /commission-settlement-desktop-table/);
  assert.equal(cssSource.slice(ruleMediaStart, cssSource.indexOf("{", ruleMediaStart) + 1), "@media (max-width: 900px) {");
  assert.equal(cssSource.slice(settlementMediaStart, cssSource.indexOf("{", settlementMediaStart) + 1), "@media (max-width: 900px) {");
  assert.match(cssSource.slice(ruleMediaStart, ruleDesktopIndex + 260), /\.commission-rule-desktop-table,\s*[\s\S]*\.commission-settlement-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource.slice(ruleMediaStart, cssSource.indexOf(".commission-settlement-kpi-grid", ruleMediaStart)), /\.commission-rule-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.match(cssSource.slice(settlementMediaStart, cssSource.indexOf(".commission-settlement-kpi-grid", settlementMediaStart)), /\.commission-settlement-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("commission settlement page follows the prototype settlement layout without fake records", () => {
  const pagePath = "app/commissions/settlements/page.tsx";

  assert.equal(existsSync(pagePath), true);

  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /title="财务管理 \/ 提成结算"/);
  assert.doesNotMatch(pageSource, /按原型整理销售和施工提成的生成、审核与发放工作台/);
  assert.match(pageSource, /提成结算日志/);
  assert.match(pageSource, /待结算提成/);
  assert.match(pageSource, /本月应发提成总额/);
  assert.match(pageSource, /待审核总额/);
  assert.match(pageSource, /已发放总额/);
  assert.match(pageSource, /角色类型/);
  assert.match(pageSource, /结算月份/);
  assert.match(pageSource, /单据状态/);
  assert.doesNotMatch(pageSource, /\{ label: "待结算", value: "PENDING" \}/);
  assert.match(pageSource, /结算日志明细/);
  assert.match(pageSource, /结算单号/);
  assert.match(pageSource, /结算单号 · 姓名\/岗位 · 结算周期 · 实发金额/);
  assert.match(pageSource, /getSettlementDisplayNo/);
  assert.match(pageSource, /单据号：/);
  assert.match(pageSource, /commission-settlement-detail-drawer/);
  assert.doesNotMatch(pageSource, /width=\{\d+\}/);
  assert.match(pageSource, /size="large"/);
  assert.match(pageSource, /selectedSettlementRow/);
  assert.match(pageSource, /结算明细/);
  assert.match(pageSource, /查看详情/);
  assert.match(pageSource, /生成本月结算单/);
  assert.match(pageSource, /导出报表/);
  assert.match(pageSource, /请先确认结算明细后再导出报表/);
  assert.doesNotMatch(pageSource, /请先确认结算流水后再导出报表/);
  assert.match(pageSource, /按生成记录核对结算周期、岗位和实发金额/);
  assert.doesNotMatch(pageSource, /当前版本展示可结算来源，不伪造已结算流水/);
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

test("commission settlement page uses business serials instead of technical ids for settlement numbers", () => {
  const pageSource = readFileSync("app/commissions/settlements/page.tsx", "utf8");

  assert.match(pageSource, /displayNo: `SALE-\$\{settlementMonth\.replace\("-", ""\)\}-\$\{index \+ 1\}`/);
  assert.match(pageSource, /displayNo: `WORK-\$\{settlementMonth\.replace\("-", ""\)\}-\$\{index \+ 1\}`/);
  assert.match(pageSource, /function getSettlementDisplayNo\(row: SettlementSourceRow\)/);
  assert.match(pageSource, /return row\.displayNo;/);
  assert.doesNotMatch(pageSource, /row\.id\.replace\("sales-"/);
  assert.doesNotMatch(pageSource, /replace\("worker-"/);
});

test("commission settlement tabs jump to the matching settlement sections", () => {
  const pageSource = readFileSync("app/commissions/settlements/page.tsx", "utf8");

  assert.match(pageSource, /COMMISSION_SETTLEMENT_TABS/);
  assert.match(pageSource, /commissionSettlementSectionRefs/);
  assert.match(pageSource, /scrollCommissionSettlementSectionIntoView/);
  assert.match(pageSource, /activeCommissionSettlementTab/);
  assert.match(pageSource, /ref=\{settlementLogSectionRef\}/);
  assert.match(pageSource, /ref=\{pendingSettlementSectionRef\}/);
  assert.match(pageSource, /aria-selected=\{activeCommissionSettlementTab === item\.key\}/);
  assert.match(pageSource, /onClick=\{\(\) => scrollCommissionSettlementSectionIntoView\(item\.key\)\}/);
  assert.doesNotMatch(pageSource, /<button className="is-active" type="button">\s*提成结算日志/);
});

test("commission settlement page uses mobile cards for settlement logs", () => {
  const pageSource = readFileSync("app/commissions/settlements/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const desktopIndex = cssSource.indexOf(".commission-settlement-log-desktop-table");
  const mediaStart = cssSource.lastIndexOf("@media", desktopIndex);

  assert.match(pageSource, /commission-settlement-log-mobile-cards/);
  assert.match(pageSource, /commission-settlement-log-mobile-card/);
  assert.match(pageSource, /commission-settlement-log-desktop-table/);
  assert.match(cssSource, /\.commission-settlement-log-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.equal(cssSource.slice(mediaStart, cssSource.indexOf("{", mediaStart) + 1), "@media (max-width: 900px) {");
  assert.match(cssSource.slice(mediaStart, desktopIndex + 120), /\.commission-settlement-log-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource.slice(mediaStart, cssSource.indexOf(".commission-settlement-queue", mediaStart)), /\.commission-settlement-log-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("commission settlement page stacks KPI filters and queues on mobile", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");
  const markerIndex = cssSource.indexOf(".commission-settlement-log-desktop-table");
  const mobileCss = cssSource.slice(
    cssSource.lastIndexOf("@media (max-width: 900px)", markerIndex),
    cssSource.indexOf("@media (min-width: 768px)", markerIndex)
  );

  assert.match(mobileCss, /\.commission-settlement-kpi-grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(mobileCss, /\.commission-settlement-filter-grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(mobileCss, /\.commission-settlement-filter-actions\s*\{[\s\S]*display: grid;/);
  assert.match(mobileCss, /\.commission-settlement-queue\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("commission settlement page avoids backend implementation copy", () => {
  const pageSource = readFileSync("app/commissions/settlements/page.tsx", "utf8");

  assert.match(pageSource, /售后扣减待确认/);
  assert.match(pageSource, /请先确认结算明细后再导出报表/);
  assert.doesNotMatch(pageSource, /请先确认结算流水后再导出报表/);
  assert.match(pageSource, /待确认/);
  assert.match(pageSource, /正式结算单、审核和发放流水会在结算确认后统一归档。/);
  assert.match(pageSource, /客户信息待确认/);
  assert.match(pageSource, /订单信息待确认/);
  assert.doesNotMatch(pageSource, /客户未加载/);
  assert.doesNotMatch(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /售后扣减待接入/);
  assert.doesNotMatch(pageSource, /结算流水接口完成后接入/);
  assert.doesNotMatch(pageSource, /将在结算流水确认后开放/);
  assert.doesNotMatch(pageSource, /待后端接入/);
  assert.doesNotMatch(pageSource, /待后端结算接口接入后补充/);
});

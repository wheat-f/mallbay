import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("rebates page uses business selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /paymentStatus: "PAID"/);
  assert.match(pageSource, /const rebateOrderOptions =/);
  assert.match(pageSource, /const rebateOptions =/);
  assert.match(pageSource, /placeholder="选择返利订单"/);
  assert.match(pageSource, /options=\{rebateOrderOptions\}/);
  assert.match(pageSource, /placeholder="选择返利申请"/);
  assert.match(pageSource, /options=\{stageRebateOptions\.length \? stageRebateOptions : rebateOptions\}/);
  assert.doesNotMatch(pageSource, /order\.orderNo \?\? order\.id/);
  assert.match(pageSource, /order\.orderNo \?\? "未编号订单"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="返利 ID"/);
});

test("rebates page table uses business labels instead of technical id columns", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /getRebateBusinessLabel/);
  assert.match(pageSource, /getRebateOrderLabel/);
  assert.match(pageSource, /title: "返利单号"/);
  assert.match(pageSource, /title: "关联订单"/);
  assert.match(pageSource, /title: "返利金额"/);
  assert.doesNotMatch(pageSource, /title: "返利"/);
  assert.doesNotMatch(pageSource, /title: "返利 ID"/);
  assert.doesNotMatch(pageSource, /title: "订单"/);
  assert.doesNotMatch(pageSource, /title: "金额"/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

test("rebates page follows the prototype review workspace layout", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /StorePageHeader title="返利管理"/);
  assert.doesNotMatch(pageSource, /已完工且已收款订单的返利申请、审核、审批和发放/);
  assert.match(pageSource, /rebate-tabs/);
  assert.match(pageSource, /rebate-rules-card/);
  assert.match(pageSource, /InfoCircleOutlined/);
  assert.match(pageSource, /<ul className="rebate-rules-list">/);
  assert.match(pageSource, /关联订单必须处于「已完成」且「全额付款」状态。/);
  assert.doesNotMatch(pageSource, /金额付款/);
  assert.doesNotMatch(pageSource, /已收款订单/);
  assert.match(pageSource, /返利金额必须 &gt; 0，且必须填写明确的返利原因。/);
  assert.match(pageSource, /rebate-workspace/);
  assert.match(pageSource, /rebate-application-list/);
  assert.match(pageSource, /rebate-review-panel/);
  assert.match(pageSource, /rebate-application-drawer/);
  assert.match(pageSource, /rebate-stage-list-title/);
  assert.match(pageSource, /activeWorkflow\.detailTitle/);
  assert.match(pageSource, /客户信息/);
  assert.match(pageSource, /getRebateCustomerLabel/);
  assert.match(pageSource, /发放操作预设/);
  assert.match(pageSource, /提交返利申请/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /rebate-apply-card/);
});

test("rebates workflow tabs switch to matching process queues", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");
  const workflowSource = readFileSync("src/features/rebates/workflow.ts", "utf8");

  assert.match(pageSource, /REBATE_WORKFLOW_TABS/);
  assert.match(pageSource, /activeRebateSection/);
  assert.match(pageSource, /getRebateRowsForWorkflow/);
  assert.match(pageSource, /getRebateWorkflowCounts/);
  assert.match(pageSource, /const activeWorkflow =/);
  assert.match(pageSource, /const stageRebateRows =/);
  assert.match(pageSource, /rebate-stage-summary/);
  assert.match(pageSource, /rebate-stage-list-title/);
  assert.match(workflowSource, /业务审核队列/);
  assert.match(workflowSource, /财务审批队列/);
  assert.match(workflowSource, /待发放队列/);
  assert.match(pageSource, /aria-pressed=\{activeRebateSection === item\.key\}/);
  assert.match(pageSource, /onClick=\{\(\) => setActiveRebateSection\(item\.key\)\}/);
  assert.doesNotMatch(pageSource, /finance: rebateReviewSectionRef/);
  assert.doesNotMatch(pageSource, /payout: rebatePayoutSectionRef/);
  assert.doesNotMatch(pageSource, /scrollIntoView/);
  assert.doesNotMatch(pageSource, /\["返利申请", "返利审核", "财务审批", "返利发放", "返利报表"\]\.map\(\(item, index\)/);
  assert.doesNotMatch(pageSource, /className=\{index === 0 \? "is-active" : ""\}/);
});

test("rebates page separates review finance and payout actions by rebate status", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /selectedRebateId/);
  assert.match(pageSource, /rebateActionForm/);
  assert.match(pageSource, /期望发放方式/);
  assert.match(pageSource, /<span>客户信息<\/span>/);
  assert.match(pageSource, /canBusinessReviewSelected/);
  assert.match(pageSource, /canFinanceApproveSelected/);
  assert.match(pageSource, /canPaySelected/);
  assert.match(pageSource, /业务审核通过/);
  assert.match(pageSource, /财务审批通过/);
  assert.match(pageSource, /发放返利/);
  assert.match(pageSource, /当前阶段暂无可执行操作/);
  assert.doesNotMatch(pageSource, /当前版本先记录发放备注/);
  assert.doesNotMatch(pageSource, /operation-action-grid/);
});

test("rebates review panel mirrors the prototype amount adjustment context", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /rebate-review-amount-field/);
  assert.match(pageSource, /rebate-drawer-amount-field/);
  assert.match(pageSource, /style=\{\{ width: "100%" \}\}/);
  assert.match(pageSource, /申请返利金额/);
  assert.doesNotMatch(pageSource, /label="金额（元）"/);
  assert.doesNotMatch(pageSource, /placeholder="金额（元）"/);
  assert.match(pageSource, /value=\{selectedRebate \? selectedRebate\.amountCents \/ 100 : undefined\}/);
  assert.match(pageSource, /原订单金额:/);
  assert.match(pageSource, /推荐比例 10%/);
  assert.match(cssSource, /\.rebate-review-amount-field/);
  assert.match(cssSource, /\.rebate-drawer-amount-field\s*\{[\s\S]*width: 100%;/);
  assert.match(cssSource, /\.rebate-review-amount-help/);
});

test("rebates page derives the active rebate without sync setState effects", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /const rebateRows = useMemo\(\(\) => rebatesQuery\.data \?\? \[\], \[rebatesQuery\.data\]\);/);
  assert.match(pageSource, /const activeRebateId = selectedRebateId \?\? stageRebateRows\[0\]\?\.id;/);
  assert.match(pageSource, /stageRebateRows\.find\(\(rebate\) => rebate\.id === activeRebateId\)/);
  assert.doesNotMatch(pageSource, /setSelectedRebateId\(rebateRows\[0\]\.id\)/);
});

test("rebates page uses mobile rebate cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /rebate-mobile-cards/);
  assert.match(pageSource, /rebate-mobile-card/);
  assert.match(pageSource, /rebate-desktop-table/);
  assert.match(cssSource, /\.rebate-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.rebate-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.rebate-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("rebates payout preference keeps the prototype recommended deduction wording", () => {
  const pageSource = readFileSync("app/rebates/page.tsx", "utf8");

  assert.match(pageSource, /抵扣返利 \(推荐\)/);
  assert.doesNotMatch(pageSource, /\{ value: "DEDUCT", label: "抵扣返利" \}/);
});

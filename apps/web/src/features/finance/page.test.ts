import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("finance page uses expense and reimbursement selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /const expenseOptions =/);
  assert.match(pageSource, /const reimbursementOptions =/);
  assert.match(pageSource, /placeholder="选择关联费用"/);
  assert.match(pageSource, /options=\{expenseOptions\}/);
  assert.match(pageSource, /placeholder="选择报销申请"/);
  assert.match(pageSource, /options=\{reimbursementOptions\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="关联费用 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="报销 ID"/);
});

test("finance page tables use business labels instead of technical id columns", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /getFinanceApplicationLabel/);
  assert.match(pageSource, /getPaymentRecordSourceLabel/);
  assert.match(pageSource, /getAuditActorLabel/);
  assert.doesNotMatch(pageSource, /title: "申请 ID"/);
  assert.doesNotMatch(pageSource, /title: "来源 ID"/);
  assert.doesNotMatch(pageSource, /row\.actorId \?\? "-"/);
});

test("finance page follows the prototype ledger workspace layout", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /finance-command-bar/);
  assert.match(pageSource, /finance-operation-hero/);
  assert.match(pageSource, /finance-application-panel/);
  assert.match(pageSource, /finance-overview-rail/);
  assert.match(pageSource, /finance-workspace/);
  assert.match(pageSource, /finance-ledger-list/);
  assert.match(pageSource, /finance-approval-panel/);
  assert.match(pageSource, /财务流水/);
  assert.match(pageSource, /审批详情/);
  assert.match(pageSource, /审核流轨迹/);
  assert.match(pageSource, /支持上传发票、付款截图或合同扫描件，审批通过后归档到费用记录。/);
  assert.doesNotMatch(pageSource, /附件上传后续接入 OSS/);
  assert.doesNotMatch(pageSource, /finance-application-strip/);
});

test("finance command tabs switch isolated workflow workspaces", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /FINANCE_SECTION_NAV_ITEMS/);
  assert.match(pageSource, /activeFinanceSection === "expense"/);
  assert.match(pageSource, /activeFinanceSection === "reimbursement"/);
  assert.match(pageSource, /activeFinanceSection === "account"/);
  assert.match(pageSource, /activeFinanceSection === "ledger"/);
  assert.match(pageSource, /onClick=\{\(\) => setActiveFinanceSection\(item\.key\)\}/);
  assert.match(pageSource, /finance-stage-summary/);
  assert.match(pageSource, /finance-section-panel/);
  assert.match(pageSource, /finance-workspace-single/);
  assert.match(cssSource, /\.finance-stage-summary\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(cssSource, /\.finance-workspace-single\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(cssSource, /\.finance-prototype-tabs\s*\{[\s\S]*position: sticky;[\s\S]*top: 72px;[\s\S]*z-index: 30;/);
  assert.match(cssSource, /\.finance-tab-list\s*\{[\s\S]*overflow-x: auto;/);
  assert.doesNotMatch(pageSource, /financeSectionRefs/);
  assert.doesNotMatch(pageSource, /scrollIntoView/);
  assert.doesNotMatch(pageSource, /\{\\["费用申请", "报销审核", "打款管理", "财务流水"\\]\.map\(\(item, index\)/);
});

test("finance page keeps application forms and account audit inside the workspace", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /finance-application-panel/);
  assert.match(pageSource, /finance-account-audit-panel/);
  assert.match(pageSource, /selectedReimbursementId/);
  assert.match(pageSource, /selectedAccount/);
  assert.doesNotMatch(pageSource, /<Tabs/);
  assert.doesNotMatch(pageSource, /<Modal/);
});

test("finance payment section uses the prototype reconciliation title", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /title="打款管理与对账"/);
  assert.doesNotMatch(pageSource, /title="账户审计"/);
});

test("finance payment section exposes prototype payout and reconciliation subsections", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /待打款列表/);
  assert.match(pageSource, /最近对账动态/);
  assert.match(pageSource, /finance-subsection-title/);
  assert.match(cssSource, /\.finance-subsection-title/);
});

test("finance payment section exposes the prototype payout type distribution", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /打款类型分布/);
  assert.match(pageSource, /finance-payout-distribution/);
  assert.match(cssSource, /\.finance-payout-distribution/);
});

test("finance application mutations guard missing store with business-safe copy", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /if \(!storeId\) throw new Error\("当前账号未加入门店"\);/);
  assert.doesNotMatch(pageSource, /financeApi\.createExpense\(\{\s*storeId: storeId!/);
  assert.doesNotMatch(pageSource, /financeApi\.createReimbursement\(\{\s*storeId: storeId!/);
});

test("finance ledger rows link to the prototype payment record detail page", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.equal(pageSource.includes("router.push(`/finance/payment-records/${row.id}`)"), true);
  assert.match(pageSource, /查看详情/);
});

test("finance page opens the ledger workspace from order payment links", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /<Suspense fallback=\{<div className="management-page" \/>\}>/);
  assert.match(pageSource, /<FinanceContent \/>/);
  assert.match(pageSource, /const financeSectionParam = searchParams\.get\("section"\)/);
  assert.match(pageSource, /const financeActionParam = searchParams\.get\("action"\)/);
  assert.match(pageSource, /financeActionParam === "record-payment"/);
  assert.match(pageSource, /finance-order-payment-entry/);
  assert.match(pageSource, /订单收款入口/);
  assert.match(pageSource, /if \(action === "record-payment"\) return "ledger"/);
});

test("finance page uses mobile ledger cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const desktopIndex = cssSource.indexOf(".finance-ledger-desktop-table");
  const mediaStart = cssSource.lastIndexOf("@media", desktopIndex);

  assert.match(pageSource, /finance-ledger-mobile-cards/);
  assert.match(pageSource, /finance-ledger-mobile-card/);
  assert.match(pageSource, /finance-ledger-desktop-table/);
  assert.match(cssSource, /\.finance-ledger-mobile-cards/);
  assert.equal(cssSource.slice(mediaStart, cssSource.indexOf("{", mediaStart) + 1), "@media (max-width: 900px) {");
  assert.match(cssSource.slice(mediaStart, desktopIndex + 130), /\.finance-ledger-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource.slice(mediaStart, cssSource.indexOf(".finance-application-desktop-table", mediaStart)), /\.finance-ledger-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("finance application tables use mobile cards for expense and reimbursement rows", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const desktopIndex = cssSource.indexOf(".finance-application-desktop-table");
  const mediaStart = cssSource.lastIndexOf("@media", desktopIndex);

  assert.match(pageSource, /finance-application-mobile-cards/);
  assert.match(pageSource, /finance-application-mobile-card/);
  assert.match(pageSource, /finance-application-desktop-table/);
  assert.match(cssSource, /\.finance-application-mobile-cards/);
  assert.equal(cssSource.slice(mediaStart, cssSource.indexOf("{", mediaStart) + 1), "@media (max-width: 900px) {");
  assert.match(cssSource.slice(mediaStart, desktopIndex + 150), /\.finance-application-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource.slice(mediaStart, cssSource.indexOf(".finance-account-desktop-table", mediaStart)), /\.finance-application-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("finance account audit panel uses mobile cards for accounts and audit events", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const accountDesktopIndex = cssSource.indexOf(".finance-account-desktop-table");
  const auditDesktopIndex = cssSource.indexOf(".finance-audit-desktop-table");
  const mediaStart = cssSource.lastIndexOf("@media", accountDesktopIndex);

  assert.match(pageSource, /finance-account-mobile-cards/);
  assert.match(pageSource, /finance-account-mobile-card/);
  assert.match(pageSource, /finance-account-desktop-table/);
  assert.match(pageSource, /finance-audit-mobile-cards/);
  assert.match(pageSource, /finance-audit-mobile-card/);
  assert.match(pageSource, /finance-audit-desktop-table/);
  assert.equal(cssSource.slice(mediaStart, cssSource.indexOf("{", mediaStart) + 1), "@media (max-width: 900px) {");
  assert.match(cssSource.slice(mediaStart, auditDesktopIndex + 120), /\.finance-account-desktop-table,\s*[\s\S]*\.finance-audit-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource.slice(mediaStart, cssSource.indexOf(".commission-rule-desktop-table", mediaStart)), /\.finance-account-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.match(cssSource.slice(mediaStart, cssSource.indexOf(".commission-rule-desktop-table", mediaStart)), /\.finance-audit-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("finance account audit query guards account selection with business-safe copy", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /请先选择账户/);
  assert.doesNotMatch(pageSource, /paymentAccountAuditEvents\(activeSelectedAccount!\.id\)/);
});

test("payment record detail page follows the prototype ledger detail layout", () => {
  const detailPath = "app/finance/payment-records/[id]/page.tsx";

  assert.equal(existsSync(detailPath), true);

  const pageSource = readFileSync(detailPath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /financeApi\.paymentRecords/);
  assert.match(pageSource, /财务流水详情/);
  assert.match(pageSource, /返回收支流水/);
  assert.doesNotMatch(pageSource, /返回财务管理/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.match(pageSource, /finance-record-detail-hero/);
  assert.match(pageSource, /finance-record-detail-actions/);
  assert.match(pageSource, /交易摘要/);
  assert.match(pageSource, /交易明细/);
  assert.match(pageSource, /账户\/状态/);
  assert.match(pageSource, /关联单据/);
  assert.match(pageSource, /审核流轨迹/);
  assert.match(pageSource, /附件凭证/);
  assert.match(pageSource, /打款详情与凭证/);
  assert.match(pageSource, /批准拨款/);
  assert.match(pageSource, /驳回申请/);
  assert.match(pageSource, /上传银行凭证/);
  assert.match(pageSource, /财务备注/);
  assert.match(pageSource, /记录时间:/);
  assert.match(pageSource, /formatRecordDateTime\(record\.createdAt\)/);
  assert.match(pageSource, /提交并标记已打款/);
  assert.doesNotMatch(pageSource, /确认核销/);
  assert.doesNotMatch(pageSource, /发起复核/);
  assert.match(pageSource, /finance-record-voucher-panel/);
  assert.match(pageSource, /支持上传银行回单、合同、发票或付款截图，归档后可随流水导出。/);
  assert.match(pageSource, /报表分析统计/);
  assert.match(pageSource, /附件凭证待归档。/);
  assert.doesNotMatch(pageSource, /当前接口未返回附件文件/);
  assert.doesNotMatch(pageSource, /OSS/);
  assert.doesNotMatch(pageSource, /经营报表统计/);
  assert.doesNotMatch(pageSource, /附件凭证字段待后续接口补齐/);
  assert.match(pageSource, /getPaymentRecordDetailTimeline/);
  assert.match(pageSource, /finance-record-detail-page/);
  assert.match(pageSource, /finance-record-detail-grid/);
  assert.match(pageSource, /finance-record-detail-panel/);
  assert.match(pageSource, /finance-record-timeline/);

  assert.match(cssSource, /\.finance-record-detail-page/);
  assert.match(cssSource, /\.finance-record-detail-hero/);
  assert.match(cssSource, /\.finance-record-detail-actions/);
  assert.match(cssSource, /\.finance-record-detail-grid/);
  assert.match(cssSource, /\.finance-record-detail-panel/);
  assert.match(cssSource, /\.finance-record-timeline/);
});

test("payment record detail page does not expose technical ids as business fields", () => {
  const pageSource = readFileSync("app/finance/payment-records/[id]/page.tsx", "utf8");

  assert.match(pageSource, /getPaymentRecordSummaryLabel\(record\)/);
  assert.match(pageSource, /label="流水摘要"/);
  assert.match(pageSource, /label="门店" value=\{storeName \?\? "当前门店"\}/);
  assert.match(pageSource, /<span>关联状态<\/span>/);
  assert.match(pageSource, /record\.sourceId \|\| record\.referenceId \? "已关联来源单据" : "未关联来源单据"/);
  assert.match(pageSource, /description: record\.sourceId \|\| record\.referenceId \? "已关联来源单据。"/);
  assert.doesNotMatch(pageSource, /label="流水编号" value=\{record\.id\}/);
  assert.doesNotMatch(pageSource, /label="门店" value=\{record\.storeId/);
  assert.doesNotMatch(pageSource, /<span>来源 ID<\/span>/);
  assert.doesNotMatch(pageSource, /record\.sourceId \?\? record\.referenceId \?\? "未关联来源单据"/);
  assert.doesNotMatch(pageSource, /来源单据：\$\{record\.sourceId \?\? record\.referenceId\}/);
});

test("payment record detail page uses business copy for pending account and operator data", () => {
  const pageSource = readFileSync("app/finance/payment-records/[id]/page.tsx", "utf8");

  assert.match(pageSource, /待确认经办人/);
  assert.match(pageSource, /待确认账户信息/);
  assert.match(pageSource, /账户待绑定/);
  assert.match(pageSource, /账号待补录/);
  assert.doesNotMatch(pageSource, /经办人未加载/);
  assert.doesNotMatch(pageSource, /账户未加载/);
  assert.doesNotMatch(pageSource, /账户信息未加载/);
  assert.doesNotMatch(pageSource, /账号未加载/);
});

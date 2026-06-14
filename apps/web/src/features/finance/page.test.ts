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
  assert.doesNotMatch(pageSource, /finance-application-strip/);
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

test("finance ledger rows link to the prototype payment record detail page", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.equal(pageSource.includes("router.push(`/finance/payment-records/${row.id}`)"), true);
  assert.match(pageSource, /查看详情/);
});

test("finance page uses mobile ledger cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /finance-ledger-mobile-cards/);
  assert.match(pageSource, /finance-ledger-mobile-card/);
  assert.match(pageSource, /finance-ledger-desktop-table/);
  assert.match(cssSource, /\.finance-ledger-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-ledger-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-ledger-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("finance application tables use mobile cards for expense and reimbursement rows", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /finance-application-mobile-cards/);
  assert.match(pageSource, /finance-application-mobile-card/);
  assert.match(pageSource, /finance-application-desktop-table/);
  assert.match(cssSource, /\.finance-application-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-application-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-application-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("finance account audit panel uses mobile cards for accounts and audit events", () => {
  const pageSource = readFileSync("app/finance/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /finance-account-mobile-cards/);
  assert.match(pageSource, /finance-account-mobile-card/);
  assert.match(pageSource, /finance-account-desktop-table/);
  assert.match(pageSource, /finance-audit-mobile-cards/);
  assert.match(pageSource, /finance-audit-mobile-card/);
  assert.match(pageSource, /finance-audit-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-account-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-account-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-audit-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.finance-audit-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("payment record detail page follows the prototype ledger detail layout", () => {
  const detailPath = "app/finance/payment-records/[id]/page.tsx";

  assert.equal(existsSync(detailPath), true);

  const pageSource = readFileSync(detailPath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /financeApi\.paymentRecords/);
  assert.match(pageSource, /财务流水详情/);
  assert.match(pageSource, /交易摘要/);
  assert.match(pageSource, /交易明细/);
  assert.match(pageSource, /账户\/状态/);
  assert.match(pageSource, /关联单据/);
  assert.match(pageSource, /审核流轨迹/);
  assert.match(pageSource, /附件凭证/);
  assert.match(pageSource, /getPaymentRecordDetailTimeline/);
  assert.match(pageSource, /finance-record-detail-page/);
  assert.match(pageSource, /finance-record-detail-grid/);
  assert.match(pageSource, /finance-record-detail-panel/);
  assert.match(pageSource, /finance-record-timeline/);

  assert.match(cssSource, /\.finance-record-detail-page/);
  assert.match(cssSource, /\.finance-record-detail-grid/);
  assert.match(cssSource, /\.finance-record-detail-panel/);
  assert.match(cssSource, /\.finance-record-timeline/);
});

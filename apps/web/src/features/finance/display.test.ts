import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FINANCE_REVIEW_OPTIONS,
  centsToYuan,
  formatCentsAsYuan,
  getFinanceAuditActionLabel,
  getFinanceApplicationLabel,
  getFinanceApprovalStatusLabel,
  getAuditActorLabel,
  getPaymentAccountTypeLabel,
  getAuditReasonText,
  getPaymentRecordSourceLabel,
  getPaymentRecordTypeLabel,
  yuanToCents
} from "./display";

test("finance display helpers format approval statuses", () => {
  assert.equal(getFinanceApprovalStatusLabel("PENDING"), "待审批");
  assert.equal(getFinanceApprovalStatusLabel("APPROVED"), "已通过");
  assert.equal(getFinanceApprovalStatusLabel("PAID"), "已打款");
  assert.equal(getFinanceApprovalStatusLabel("UNKNOWN"), "UNKNOWN");
});

test("finance review options use the same labels as status helpers", () => {
  assert.deepEqual(FINANCE_REVIEW_OPTIONS, [
    { value: "APPROVED", label: "已通过" },
    { value: "REJECTED", label: "已拒绝" },
    { value: "PAID", label: "已打款" }
  ]);
});

test("payment record display helper formats record types", () => {
  assert.equal(getPaymentRecordTypeLabel("ORDER_PAYMENT"), "订单收款");
  assert.equal(getPaymentRecordTypeLabel("REIMBURSEMENT"), "报销打款");
  assert.equal(getPaymentRecordTypeLabel("UNKNOWN"), "UNKNOWN");
});

test("payment account and audit display helpers format business labels", () => {
  assert.equal(getPaymentAccountTypeLabel("CORPORATE"), "对公账户");
  assert.equal(getPaymentAccountTypeLabel("WECHAT"), "微信");
  assert.equal(getPaymentAccountTypeLabel("UNKNOWN"), "UNKNOWN");
  assert.equal(getFinanceAuditActionLabel("PAYMENT_ACCOUNT_UPDATED"), "收款账户变更");
  assert.equal(getFinanceAuditActionLabel("UNKNOWN"), "UNKNOWN");
  assert.equal(getAuditActorLabel({ actor: { username: "zhouqi", nickname: "周琪" }, actorId: "user-1" }), "周琪");
  assert.equal(getAuditActorLabel({ actor: { username: "zhouqi" }, actorId: "user-1" }), "zhouqi");
  assert.equal(getAuditActorLabel({ actorId: "cmprn332u0000lpibg4bbog5t" }), "未知用户");
  assert.equal(getAuditReasonText({ reason: "更换账户名称" }), "原因：更换账户名称");
  assert.equal(getAuditReasonText({}), "-");
});

test("finance money helpers convert between yuan and integer cents", () => {
  assert.equal(yuanToCents(12.34), 1234);
  assert.equal(yuanToCents(0.1 + 0.2), 30);
  assert.equal(centsToYuan(1234), 12.34);
  assert.equal(formatCentsAsYuan(123456), "¥1,234.56");
  assert.equal(formatCentsAsYuan(undefined), "-");
});

test("finance application and payment source helpers use business labels", () => {
  const reimbursement = {
    id: "reimbursement-1",
    title: "施工油费报销",
    amountCents: 12345,
    status: "APPROVED"
  };

  assert.equal(getFinanceApplicationLabel(reimbursement), "施工油费报销 / ¥123.45 / 已通过");
  assert.equal(
    getPaymentRecordSourceLabel(
      { type: "REIMBURSEMENT", sourceId: "reimbursement-1", note: "报销打款" },
      { reimbursements: [reimbursement] }
    ),
    "施工油费报销 / ¥123.45 / 已通过"
  );
  assert.equal(getPaymentRecordSourceLabel({ type: "OTHER", note: "手工调整" }, {}), "手工调整");
  assert.equal(
    getPaymentRecordSourceLabel({ type: "EXPENSE", sourceId: "expense-technical-id" }, { expenses: [] }),
    "来源未加载"
  );
});

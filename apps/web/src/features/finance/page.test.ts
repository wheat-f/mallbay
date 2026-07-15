import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("finance overview is an overview and links to isolated workspaces", () => {
  const source = readFileSync("app/finance/page.tsx", "utf8");
  assert.match(source, /financeApi\.overview/);
  assert.match(source, /\/finance\/expenses/);
  assert.match(source, /\/finance\/reimbursements/);
  assert.match(source, /\/finance\/accounts/);
  assert.match(source, /\/finance\/ledger/);
  assert.doesNotMatch(source, /新建费用申请/);
});

test("finance workflows expose list and detail routes", () => {
  for (const path of ["app/finance/expenses/page.tsx", "app/finance/expenses/[id]/page.tsx", "app/finance/reimbursements/page.tsx", "app/finance/reimbursements/[id]/page.tsx", "app/finance/accounts/page.tsx", "app/finance/ledger/page.tsx"]) assert.equal(existsSync(path), true, path);
  const expenseDetail = readFileSync("app/finance/expenses/[id]/page.tsx", "utf8");
  const reimbursementDetail = readFileSync("app/finance/reimbursements/[id]/page.tsx", "utf8");
  assert.match(expenseDetail, /FinanceApprovalTimeline/);
  assert.match(expenseDetail, /FinanceAttachmentUpload/);
  assert.match(expenseDetail, /reviewExpense/);
  assert.match(reimbursementDetail, /reviewReimbursement/);
});

test("finance UI uses business labels and separate ledger direction", () => {
  const table = readFileSync("src/features/finance/components/finance-application-table.tsx", "utf8");
  const ledger = readFileSync("app/finance/ledger/page.tsx", "utf8");
  assert.match(table, /当前节点/);
  assert.match(table, /申请编号/);
  assert.match(ledger, /收支方向/);
  assert.match(ledger, /getPaymentDirectionLabel/);
});

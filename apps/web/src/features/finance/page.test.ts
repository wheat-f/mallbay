import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

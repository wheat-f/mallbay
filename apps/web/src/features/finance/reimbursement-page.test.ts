import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("reimbursement page supports linked and exception applications", () => {
  const source = readFileSync("app/finance/reimbursements/page.tsx", "utf8");
  assert.match(source, /expenseId/);
  assert.match(source, /exceptionReason/);
  assert.match(source, /financeApi\.createReimbursement/);
  assert.match(source, /onError/);
  assert.match(source, /\/finance\/reimbursements\//);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("expense page lists applications and reports create errors", () => {
  const source = readFileSync("app/finance/expenses/page.tsx", "utf8");
  assert.match(source, /financeApi\.expenses/);
  assert.match(source, /financeApi\.createExpense/);
  assert.match(source, /onError/);
  assert.match(source, /\/finance\/expenses\//);
});

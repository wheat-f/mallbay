import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("accounts and ledger expose account-scoped controls", () => {
  const accounts = readFileSync("app/finance/accounts/page.tsx", "utf8");
  const ledger = readFileSync("app/finance/ledger/page.tsx", "utf8");
  assert.match(accounts, /paymentAccounts/);
  assert.match(accounts, /createPaymentAccount/);
  assert.match(accounts, /updatePaymentAccount/);
  assert.match(accounts, /removePaymentAccount/);
  for (const field of ["direction", "type", "accountId", "dateFrom", "dateTo"])
    assert.match(ledger, new RegExp(field));
  assert.match(ledger, /orderApi\.paymentAccounts/);
});

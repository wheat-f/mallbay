import assert from "node:assert/strict";
import { test } from "node:test";
import { financeApi } from "./api";

test("financeApi.createExpense posts JSON to /finance/expenses", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "expense-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await financeApi.createExpense({ storeId: "store-1", title: "耗材", amountCents: 1000, reason: "采购" });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/finance/expenses");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

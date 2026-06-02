import assert from "node:assert/strict";
import { test } from "node:test";
import { invoicesApi } from "./api";

test("invoicesApi.apply posts JSON to /invoices", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "invoice-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await invoicesApi.apply({ orderId: "order-1", title: "客户发票", amountCents: 1000 });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/invoices");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

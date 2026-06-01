import assert from "node:assert/strict";
import { test } from "node:test";
import { afterSalesApi } from "./api";

test("afterSalesApi.create posts JSON to /after-sales", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "after-sale-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await afterSalesApi.create({ orderId: "order-1", description: "返工" });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/after-sales");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

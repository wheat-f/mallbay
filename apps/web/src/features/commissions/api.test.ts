import assert from "node:assert/strict";
import { test } from "node:test";
import { commissionsApi } from "./api";

test("commissionsApi.generateSales posts to /commissions/orders/:orderId/sales", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "log-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await commissionsApi.generateSales("order-1");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/commissions/orders/order-1/sales");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

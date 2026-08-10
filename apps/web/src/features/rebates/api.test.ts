import assert from "node:assert/strict";
import { test } from "node:test";
import { rebatesApi } from "./api";

test("rebatesApi.apply posts JSON to /rebates", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "rebate-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await rebatesApi.apply({ orderId: "order-1", amountCents: 1000, reason: "返利" });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:4001/rebates");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

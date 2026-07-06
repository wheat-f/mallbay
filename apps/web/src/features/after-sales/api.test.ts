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

test("afterSalesApi.detail gets a single after-sale detail", async () => {
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
    await afterSalesApi.detail("after-sale-1");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/after-sales/after-sale-1");
    assert.equal((calls[0] as { init: RequestInit }).init.method, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("afterSalesApi.close posts to the after-sale close endpoint", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "after-sale-1", status: "CLOSED" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await afterSalesApi.close("after-sale-1");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/after-sales/after-sale-1/close");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

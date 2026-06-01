import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryApi } from "./api";

test("inventoryApi.createBatch posts JSON to /inventory/batches", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "batch-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.createBatch({
      storeId: "store-1",
      productId: "product-1",
      batchNo: "B20260601",
      totalQuantity: 10
    });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/batches");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi.lockOrder posts to /inventory/orders/:orderId/lock", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ locked: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.lockOrder("order-1");

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/orders/order-1/lock");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { orderApi } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("orderApi.create posts JSON to /orders", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ id: "order-1", orderNo: "ORD202605310001" })
    } as Response;
  }) as typeof fetch;

  const result = await orderApi.create({
    storeId: "store-1",
    customerId: "customer-1",
    constructionType: "PPF",
    constructionLocation: "IN_STORE",
    items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
    laborCostCents: 200000
  });

  assert.equal(capturedInput, "http://localhost:3001/orders");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(result, { id: "order-1", orderNo: "ORD202605310001" });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { reportsApi } from "./api";

test("reportsApi.summary queries /reports/summary by store", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ orders: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await reportsApi.summary("store-1");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/reports/summary?storeId=store-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

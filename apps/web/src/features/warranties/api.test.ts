import assert from "node:assert/strict";
import { test } from "node:test";
import { warrantiesApi } from "./api";

test("warrantiesApi.lookup queries warranty number", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ warrantyNo: "WAR202606010001" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await warrantiesApi.lookup("WAR202606010001");

    assert.equal(
      (calls[0] as { input: string }).input,
      "http://localhost:4001/warranties/lookup?no=WAR202606010001"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("afterSalesApi.judge posts responsibility and resolution without worker photo evidence", async () => {
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
    await afterSalesApi.judge("after-sale-1", {
      responsibility: "CONSTRUCTION",
      resolutionNote: "已补证"
    });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/after-sales/after-sale-1/responsibility");
    const body = JSON.parse(String((calls[0] as { init: RequestInit }).init.body));
    assert.equal(body.responsibility, "CONSTRUCTION");
    assert.equal(body.resolutionNote, "已补证");
    assert.equal("constructionPhotos" in body, false);
    assert.equal("supplementPhotos" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("afterSalesApi.submitEvidence posts worker photo evidence without responsibility judgment", async () => {
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
    await afterSalesApi.submitEvidence("after-sale-1", {
      constructionPhotos: [{ url: "data:image/png;base64,after", note: "施工后复查" }],
      supplementPhotos: [{ url: "data:image/png;base64,supplement", note: "客户确认" }]
    });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/after-sales/after-sale-1/evidence");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    const body = JSON.parse(String((calls[0] as { init: RequestInit }).init.body));
    assert.deepEqual(body.constructionPhotos, [{ url: "data:image/png;base64,after", note: "施工后复查" }]);
    assert.deepEqual(body.supplementPhotos, [{ url: "data:image/png;base64,supplement", note: "客户确认" }]);
    assert.equal("responsibility" in body, false);
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

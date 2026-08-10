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
    assert.equal((calls[0] as { input: string }).input, "http://localhost:4001/invoices");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invoicesApi.issue sends electronic invoice file url", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "invoice-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await invoicesApi.issue("invoice-1", {
      invoiceNo: "INV-1",
      fileUrl: "https://cdn.example.com/invoices/INV-1.pdf",
      note: "issued"
    });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:4001/invoices/invoice-1/issue");
    assert.equal(
      (calls[0] as { init: RequestInit }).init.body,
      JSON.stringify({
        invoiceNo: "INV-1",
        fileUrl: "https://cdn.example.com/invoices/INV-1.pdf",
        note: "issued"
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invoicesApi.send posts invoice delivery metadata", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "invoice-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await invoicesApi.send("invoice-1", {
      recipient: "customer@example.com",
      channel: "EMAIL",
      note: "发送电子发票"
    });
    assert.equal((calls[0] as { input: string }).input, "http://localhost:4001/invoices/invoice-1/send");
    assert.equal(
      (calls[0] as { init: RequestInit }).init.body,
      JSON.stringify({
        recipient: "customer@example.com",
        channel: "EMAIL",
        note: "发送电子发票"
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

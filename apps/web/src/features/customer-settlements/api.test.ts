import assert from "node:assert/strict";
import { test } from "node:test";
import { customerSettlementApi } from "./api";

test("customerSettlementApi.statements reads the semantic settlement projection", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      items: [],
      semantics: {
        dateBasis: "ORDER_CREATED_AT",
        includedOrderKinds: ["COMPLETED", "WARRANTIED"],
        amountTypes: {
          receivable: "ORDER_TOTAL",
          collected: "ORDER_PAID",
          outstanding: "ORDER_OUTSTANDING"
        },
        allocationType: "CUSTOMER_STATEMENT_ITEM"
      },
      generatedAt: "2026-08-10T00:00:00.000Z"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const result = await customerSettlementApi.statements({ storeId: "store-1", customerId: "customer-1" });
    assert.equal(result.semantics.dateBasis, "ORDER_CREATED_AT");
    assert.equal(result.semantics.allocationType, "CUSTOMER_STATEMENT_ITEM");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/customer-statements?storeId=store-1&customerId=customer-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customerSettlementApi.statementCandidates reads candidate order semantics", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      items: [],
      semantics: {
        dateBasis: "ORDER_CREATED_AT",
        includedOrderKinds: ["COMPLETED", "WARRANTIED"],
        amountTypes: {
          receivable: "ORDER_TOTAL",
          collected: "ORDER_PAID",
          outstanding: "ORDER_OUTSTANDING"
        }
      },
      generatedAt: "2026-08-10T00:00:00.000Z"
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await customerSettlementApi.statementCandidates({ storeId: "store-1", customerId: "customer-1" });
    assert.equal(result.semantics.dateBasis, "ORDER_CREATED_AT");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/customer-statements/candidate-orders?storeId=store-1&customerId=customer-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customerSettlementApi.receipts reads collection and reversal semantics", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      items: [],
      semantics: {
        dateBasis: "RECEIVED_AT",
        includedOrderKinds: ["COMPLETED", "WARRANTIED"],
        amountTypes: {
          collected: "RECEIPT_AMOUNT",
          allocated: "ORDER_PAYMENT",
          reversed: "REVERSAL_AMOUNT"
        },
        allocationType: "ORDER_PAYMENT"
      },
      generatedAt: "2026-08-10T00:00:00.000Z"
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await customerSettlementApi.receipts({ storeId: "store-1", customerId: "customer-1" });
    assert.equal(result.semantics.dateBasis, "RECEIVED_AT");
    assert.equal(result.semantics.amountTypes.reversed, "REVERSAL_AMOUNT");
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/customer-receipts?storeId=store-1&customerId=customer-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

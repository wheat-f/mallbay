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

test("orderApi.list includes date construction type and payment status filters", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedInput = input;
    return {
      ok: true,
      json: async () => ({ items: [], total: 0, page: 1, pageSize: 20 })
    } as Response;
  }) as typeof fetch;

  await orderApi.list({
    storeId: "store-1",
    page: 1,
    pageSize: 20,
    q: "小明",
    status: "PENDING_DISPATCH",
    constructionType: "PPF",
    paymentStatus: "PARTIAL",
    createdFrom: "2026-06-01",
    createdTo: "2026-06-05"
  });

  const url = new URL(String(capturedInput));
  assert.equal(url.pathname, "/orders");
  assert.equal(url.searchParams.get("storeId"), "store-1");
  assert.equal(url.searchParams.get("page"), "1");
  assert.equal(url.searchParams.get("pageSize"), "20");
  assert.equal(url.searchParams.get("q"), "小明");
  assert.equal(url.searchParams.get("status"), "PENDING_DISPATCH");
  assert.equal(url.searchParams.get("constructionType"), "PPF");
  assert.equal(url.searchParams.get("paymentStatus"), "PARTIAL");
  assert.equal(url.searchParams.get("createdFrom"), "2026-06-01");
  assert.equal(url.searchParams.get("createdTo"), "2026-06-05");
});

test("orderApi.updatePaymentAccount sends change reason in PATCH body", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ id: "account-1" })
    } as Response;
  }) as typeof fetch;

  await orderApi.updatePaymentAccount("account-1", {
    name: "新收款账户",
    changeReason: "财务账户名称调整"
  });

  assert.equal(capturedInput, "http://localhost:3001/payment-accounts/account-1");
  assert.equal(capturedInit?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    name: "新收款账户",
    changeReason: "财务账户名称调整"
  });
});

test("orderApi.updateCommercials patches order items amount and change reason", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ id: "order-1" })
    } as Response;
  }) as typeof fetch;

  await orderApi.updateCommercials("order-1", {
    items: [{ productId: "product-1", quantity: 2, unitPriceCents: 1000 }],
    laborCostCents: 500,
    remark: "调整备注",
    changeReason: "客户变更施工范围"
  });

  assert.equal(capturedInput, "http://localhost:3001/orders/order-1/commercials");
  assert.equal(capturedInit?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    items: [{ productId: "product-1", quantity: 2, unitPriceCents: 1000 }],
    laborCostCents: 500,
    remark: "调整备注",
    changeReason: "客户变更施工范围"
  });
});

test("orderApi.auditEvents queries /orders/:id/audit-events", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedInput = input;
    return {
      ok: true,
      json: async () => [{ id: "audit-1", action: "ORDER_COMMERCIALS_UPDATED", createdAt: "2026-06-06T00:00:00.000Z" }]
    } as Response;
  }) as typeof fetch;

  const result = await orderApi.auditEvents("order-1");

  assert.equal(capturedInput, "http://localhost:3001/orders/order-1/audit-events");
  assert.deepEqual(result, [
    { id: "audit-1", action: "ORDER_COMMERCIALS_UPDATED", createdAt: "2026-06-06T00:00:00.000Z" }
  ]);
});

test("orderApi.paymentAccountAuditEvents queries /payment-accounts/:id/audit-events", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedInput = input;
    return {
      ok: true,
      json: async () => [{ id: "audit-1", action: "PAYMENT_ACCOUNT_UPDATED", createdAt: "2026-06-06T00:00:00.000Z" }]
    } as Response;
  }) as typeof fetch;

  const result = await orderApi.paymentAccountAuditEvents("account-1");

  assert.equal(capturedInput, "http://localhost:3001/payment-accounts/account-1/audit-events");
  assert.deepEqual(result, [
    { id: "audit-1", action: "PAYMENT_ACCOUNT_UPDATED", createdAt: "2026-06-06T00:00:00.000Z" }
  ]);
});

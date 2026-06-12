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

test("inventoryApi queries pending match orders by store", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push({ input });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.pendingMatchOrders("store-1");

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/orders/pending-match?storeId=store-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi queries inventory movements with advanced filters", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push({ input });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.movements({
      storeId: "store-1",
      productId: "product-1",
      batchId: "batch-1",
      orderId: "order-1",
      movementType: "ORDER_LOCK",
      createdById: "user-1"
    });

    assert.equal(
      (calls[0] as { input: string }).input,
      "http://localhost:3001/inventory/movements?storeId=store-1&productId=product-1&batchId=batch-1&orderId=order-1&movementType=ORDER_LOCK&createdById=user-1"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi creates purchase order from purchase requirement", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "po-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.createPurchaseOrderFromRequirement("pr-1", { supplierName: "3M" });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/purchase-requirements/pr-1/purchase-orders");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi approves purchase orders", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "po-1", status: "ORDERED" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.approvePurchaseOrder("po-1");

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/purchase-orders/po-1/approve");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi cancels purchase orders with reason", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "po-1", status: "CANCELLED" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.cancelPurchaseOrder("po-1", { reason: "供应商缺货" });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/purchase-orders/po-1/cancel");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    assert.equal((calls[0] as { init: RequestInit }).init.body, JSON.stringify({ reason: "供应商缺货" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi splits batch and creates stock operation", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.splitBatch("batch-1", { quantityMeters: 30 });
    await inventoryApi.createStockOperation({ batchId: "batch-1", movementType: "DAMAGE_OUT", quantity: 3 });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/batches/batch-1/split");
    assert.equal((calls[1] as { input: string }).input, "http://localhost:3001/inventory/stock-operations");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi manages supplier master data", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "supplier-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.suppliers("store-1");
    await inventoryApi.createSupplier({ storeId: "store-1", name: "3M", contactName: "王采购" });
    await inventoryApi.updateSupplier("supplier-1", { contactPhone: "13800000000", isActive: true });
    await inventoryApi.createSupplierContact("supplier-1", { name: "李采购", phone: "13900000000", role: "售后" });
    await inventoryApi.createSupplierRatingHistory("supplier-1", { rating: 5, note: "交付及时" });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/inventory/suppliers?storeId=store-1");
    assert.equal((calls[1] as { input: string }).input, "http://localhost:3001/inventory/suppliers");
    assert.equal((calls[1] as { init: RequestInit }).init.method, "POST");
    assert.equal((calls[2] as { input: string }).input, "http://localhost:3001/inventory/suppliers/supplier-1");
    assert.equal((calls[2] as { init: RequestInit }).init.method, "PATCH");
    assert.equal((calls[3] as { input: string }).input, "http://localhost:3001/inventory/suppliers/supplier-1/contacts");
    assert.equal((calls[3] as { init: RequestInit }).init.method, "POST");
    assert.equal((calls[4] as { input: string }).input, "http://localhost:3001/inventory/suppliers/supplier-1/rating-history");
    assert.equal((calls[4] as { init: RequestInit }).init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inventoryApi.receivePurchaseItemBatches posts scanned batches once", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ received: [], failed: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await inventoryApi.receivePurchaseItemBatches("poi-1", [
      { batchNo: "B001", quantity: 1, supplierName: "3M" },
      { batchNo: "B002", quantity: 2 }
    ]);

    assert.equal(calls.length, 1);
    assert.equal(
      (calls[0] as { input: string }).input,
      "http://localhost:3001/inventory/purchase-orders/items/poi-1/receive-batches"
    );
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    assert.equal(
      (calls[0] as { init: RequestInit }).init.body,
      JSON.stringify({
        batches: [
          { batchNo: "B001", quantity: 1, supplierName: "3M" },
          { batchNo: "B002", quantity: 2 }
        ]
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

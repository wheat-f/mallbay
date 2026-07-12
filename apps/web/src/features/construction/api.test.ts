import assert from "node:assert/strict";
import { test } from "node:test";
import { constructionApi } from "./api";

test("constructionApi.upsertCapacity posts JSON to /construction/capacities", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "capacity-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const result = await constructionApi.upsertCapacity({
      storeId: "store-1",
      date: "2026-06-01",
      inStoreCapacity: 1,
      outsideCapacity: 1,
      heatFilmCapacity: 1,
      inspectionCapacity: 1
    });

    assert.deepEqual(result, { id: "capacity-1" });
    assert.equal(calls.length, 1);
    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/construction/capacities");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    assert.equal(
      (calls[0] as { init: RequestInit }).init.body,
      JSON.stringify({
        storeId: "store-1",
        date: "2026-06-01",
        inStoreCapacity: 1,
        outsideCapacity: 1,
        heatFilmCapacity: 1,
        inspectionCapacity: 1
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("constructionApi.assignOrder posts worker ids to /construction/orders/:id/assign", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "record-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await constructionApi.assignOrder("order-1", { workerUserIds: ["worker-1"] });

    assert.equal(
      (calls[0] as { input: string }).input,
      "http://localhost:3001/construction/orders/order-1/assign"
    );
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    assert.equal((calls[0] as { init: RequestInit }).init.body, JSON.stringify({ workerUserIds: ["worker-1"] }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("constructionApi.schedules queries schedule list by store and date range", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await constructionApi.schedules({ storeId: "store-1", from: "2026-06-01", to: "2026-06-07" });

    assert.equal(
      (calls[0] as { input: string }).input,
      "http://localhost:3001/construction/schedules?storeId=store-1&from=2026-06-01&to=2026-06-07"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("constructionApi.upsertSchedule posts JSON to /construction/schedules", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "schedule-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await constructionApi.upsertSchedule({
      storeId: "store-1",
      workerId: "worker-1",
      date: "2026-06-01",
      status: "WORKING",
      note: "早班"
    });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/construction/schedules");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    assert.equal(
      (calls[0] as { init: RequestInit }).init.body,
      JSON.stringify({
        storeId: "store-1",
        workerId: "worker-1",
        date: "2026-06-01",
        status: "WORKING",
        note: "早班"
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("constructionApi.offlineSync posts queued operations to /construction/offline-sync", async () => {
  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await constructionApi.offlineSync({
      operations: [{ clientOperationId: "op-1", type: "TASK_STATUS", payload: { orderId: "order-1" } }]
    });

    assert.equal((calls[0] as { input: string }).input, "http://localhost:3001/construction/offline-sync");
    assert.equal((calls[0] as { init: RequestInit }).init.method, "POST");
    assert.equal(
      (calls[0] as { init: RequestInit }).init.body,
      JSON.stringify({
        operations: [{ clientOperationId: "op-1", type: "TASK_STATUS", payload: { orderId: "order-1" } }]
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

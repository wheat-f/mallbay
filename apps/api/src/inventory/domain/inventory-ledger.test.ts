import assert from "node:assert/strict";
import { test } from "node:test";
import { InventoryLedger } from "./inventory-ledger";

test("InventoryLedger routes reserve through the stock-fact seam", async () => {
  const calls: unknown[] = [];
  const implementation = {
    createOrderInventoryAllocations: async (...args: unknown[]) => {
      calls.push(args);
      return { locked: [] };
    }
  };
  const ledger = new InventoryLedger(implementation as never);
  const user = { id: "manager-1" } as never;
  const allocations = { allocations: [{ batchId: "batch-1", orderItemId: "item-1", quantity: 1 }] } as never;

  const result = await ledger.reserve(user, { orderId: "order-1", allocations });

  assert.deepEqual(result, { locked: [] });
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as unknown[])[1], "order-1");
});

test("InventoryLedger routes stock queries and batch changes through the same seam", async () => {
  const calls: string[] = [];
  const implementation = {
    listBatches: async () => { calls.push("batches"); return []; },
    listMovements: async () => { calls.push("movements"); return []; },
    createBatch: async () => { calls.push("receive-batch"); return { id: "batch-1" }; },
    convertBatchUnit: async () => { calls.push("convert"); return { id: "batch-1" }; },
    splitBatch: async () => { calls.push("split"); return { id: "batch-2" }; },
    listPendingMatchOrders: async () => { calls.push("pending-match"); return []; },
    getOrderInventoryMatch: async () => { calls.push("order-match"); return { orderId: "order-1" }; }
  } as never;
  const ledger = new InventoryLedger(implementation);

  await ledger.listBatches({} as never, {} as never);
  await ledger.trace({} as never, {} as never);
  await ledger.receiveBatch({} as never, {} as never);
  await ledger.convertBatch({} as never, "batch-1", {} as never);
  await ledger.splitBatch({} as never, "batch-1", {} as never);
  await ledger.pendingMatches({} as never, "store-1");
  await ledger.orderMatch({} as never, "order-1");

  assert.deepEqual(calls, ["batches", "movements", "receive-batch", "convert", "split", "pending-match", "order-match"]);
});

test("InventoryLedger exposes the complete stock fact command boundary", async () => {
  const calls: string[] = [];
  const implementation = {
    createOrderInventoryAllocations: async () => { calls.push("reserve"); return { locked: [] }; },
    releaseOrderInventory: async () => { calls.push("release"); return { released: [] }; },
    receivePurchaseItem: async () => { calls.push("receive"); return { received: true }; },
    receivePurchaseItemBatches: async () => { calls.push("receive-batches"); return { received: true }; },
    outboundOrderInventory: async () => { calls.push("outbound"); return { outbound: true }; },
    createStockOperation: async () => { calls.push("adjust"); return { id: "movement-1" }; }
  } as never;
  const ledger = new InventoryLedger(implementation);

  await ledger.reserve({} as never, { orderId: "order-1", allocations: {} as never });
  await ledger.release({} as never, { orderId: "order-1" });
  await ledger.receive({} as never, { purchaseOrderItemId: "item-1", receipt: {} as never });
  await ledger.receiveBatches({} as never, { purchaseOrderItemId: "item-1", receipt: {} as never });
  await ledger.outbound({} as never, { orderId: "order-1" });
  await ledger.adjust({} as never, {} as never);

  assert.deepEqual(calls, ["reserve", "release", "receive", "receive-batches", "outbound", "adjust"]);
});

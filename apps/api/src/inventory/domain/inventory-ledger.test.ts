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
    outboundOrderInventory: async () => { calls.push("outbound"); return { outbound: true }; },
    createStockOperation: async () => { calls.push("adjust"); return { id: "movement-1" }; }
  } as never;
  const ledger = new InventoryLedger(implementation);

  await ledger.reserve({} as never, { orderId: "order-1", allocations: {} as never });
  await ledger.release({} as never, { orderId: "order-1" });
  await ledger.outbound({} as never, { orderId: "order-1" });
  await ledger.adjust({} as never, {} as never);

  assert.deepEqual(calls, ["reserve", "release", "outbound", "adjust"]);
});

test("InventoryLedger makes purchase receiving idempotent and rejects payload reuse", async () => {
  const writes: string[] = [];
  let movement: any;
  const batch = { id: "batch-1", batchNo: "B001", unitCostCents: 100 };
  const transaction = {
    inventoryMovement: {
      findFirst: async () => movement,
      create: async ({ data }: { data: any }) => {
        writes.push("movement");
        movement = { ...data, batch };
        return movement;
      }
    },
    inventoryBatch: {
      findUnique: async () => null,
      upsert: async () => {
        writes.push("batch");
        return batch;
      }
    }
  };
  const ledger = new InventoryLedger({} as never);
  const input = {
    storeId: "store-1", purchaseOrderItemId: "item-1", productId: "product-1", batchNo: "B001",
    supplierName: "供应商", quantity: 2, packageUnit: "PIECE", baseUnit: "PIECE", baseQuantityPerPackage: 1,
    baseQuantity: 2, unitCostCents: 100, actorId: "worker-1", idempotencyKey: "receive-1"
  } as never;

  assert.equal((await ledger.receivePurchaseWithin(transaction as never, input)).replayed, false);
  assert.equal((await ledger.receivePurchaseWithin(transaction as never, input)).replayed, true);
  assert.deepEqual(writes, ["batch", "movement"]);
  await assert.rejects(
    () => ledger.receivePurchaseWithin(transaction as never, { ...input, quantity: 3, baseQuantity: 3 } as never),
    /幂等键已被不同收货内容使用/
  );
});

test("InventoryLedger releases allocations and records one typed movement per allocation", async () => {
  const writes: string[] = [];
  const transaction = {
    orderInventoryAllocation: {
      findMany: async () => [{ id: "allocation-1", storeId: "store-1", batchId: "batch-1", productId: "product-1", lockedQuantity: 3, outboundQuantity: 1 }],
      update: async () => { writes.push("allocation"); return {}; }
    },
    inventoryBatch: { update: async () => { writes.push("batch"); return {}; } },
    inventoryMovement: { create: async ({ data }: { data: { movementType: string; sourceType: string; quantity: number } }) => { writes.push(`${data.movementType}:${data.sourceType}:${data.quantity}`); return {}; } }
  };
  const ledger = new InventoryLedger({} as never);

  const result = await ledger.releaseWithin(transaction as never, { orderId: "order-1", actorId: "worker-1", reasonCode: "ORDER_CANCELLED" });

  assert.deepEqual(result, { released: 1, allocationIds: ["allocation-1"] });
  assert.deepEqual(writes, ["batch", "allocation", "STOCK_RELEASE:ORDER_LIFECYCLE_RELEASE:2"]);
});

test("InventoryLedger owns typed return inventory facts", async () => {
  const writes: string[] = [];
  const transaction = {
    inventoryBatch: {
      create: async ({ data }: { data: { sourceType: string } }) => { writes.push(`batch:${data.sourceType}`); return { id: "batch-1", unit: "PIECE" }; },
      findUnique: async () => ({ id: "source-1", storeId: "store-1", productId: "product-1", unit: "PIECE", baseUnit: "PIECE", totalQuantity: 4, availableQuantity: 4, unitCostCents: 10, inventoryStatus: "AVAILABLE" }),
      update: async () => { writes.push("update"); return {}; }
    },
    inventoryMovement: { create: async ({ data }: { data: { movementType: string; sourceType: string } }) => { writes.push(`${data.movementType}:${data.sourceType}`); return {}; } }
  };
  const ledger = new InventoryLedger({} as never);

  await ledger.receiveSalesReturnWithin(transaction as never, {
    storeId: "store-1", productId: "product-1", batchNo: "RET-1", unit: "PIECE" as never, baseUnit: "PIECE" as never,
    quantity: 1, availableQuantity: 1, unitCostCents: 10, inventoryStatus: "AVAILABLE" as never,
    sourceId: "return-1", returnId: "return-1", sourceDetailId: "detail-1", actorId: "worker-1", note: "退货收货"
  });
  await ledger.outboundPurchaseReturnWithin(transaction as never, {
    storeId: "store-1", batchId: "source-1", quantity: 1, returnId: "return-2", sourceDetailId: "detail-2", actorId: "worker-1"
  });

  assert.deepEqual(writes, ["batch:SALES_RETURN", "RETURN_IN:SALES_RETURN", "update", "RETURN_OUT:PURCHASE_RETURN"]);
});

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

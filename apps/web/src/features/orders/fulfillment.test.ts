import assert from "node:assert/strict";
import { test } from "node:test";
import { getFulfillmentInventoryStatus, getFulfillmentInventorySummary } from "./fulfillment";

test("getFulfillmentInventoryStatus shows matched when stock is locked for the order item", () => {
  assert.deepEqual(
    getFulfillmentInventoryStatus({
      quantity: 1,
      inventoryAllocations: [{ lockedQuantity: 1, outboundQuantity: 0, status: "LOCKED" }]
    }),
    { label: "已匹配", color: "success" }
  );
});

test("getFulfillmentInventoryStatus shows outbound after inventory has left stock", () => {
  assert.deepEqual(
    getFulfillmentInventoryStatus({
      quantity: 1,
      inventoryAllocations: [{ lockedQuantity: 1, outboundQuantity: 1, status: "OUTBOUND" }]
    }),
    { label: "已出库", color: "success" }
  );
});

test("getFulfillmentInventoryStatus keeps unmatched only when no active allocation exists", () => {
  assert.deepEqual(
    getFulfillmentInventoryStatus({
      quantity: 2,
      inventoryAllocations: [{ lockedQuantity: 1, outboundQuantity: 0, status: "RELEASED" }]
    }),
    { label: "待库房匹配", color: "processing" }
  );
});

test("getFulfillmentInventorySummary lets matched orders continue to construction dispatch", () => {
  assert.deepEqual(
    getFulfillmentInventorySummary([
      {
        quantity: 1,
        inventoryAllocations: [{ lockedQuantity: 1, outboundQuantity: 0, status: "LOCKED" }]
      }
    ]),
    { status: "matched", label: "已匹配", canEnterConstruction: true }
  );
});

test("getFulfillmentInventorySummary keeps partially matched orders in inventory matching", () => {
  assert.deepEqual(
    getFulfillmentInventorySummary([
      {
        quantity: 2,
        inventoryAllocations: [{ lockedQuantity: 1, outboundQuantity: 0, status: "LOCKED" }]
      }
    ]),
    { status: "partial", label: "部分匹配", canEnterConstruction: false }
  );
});

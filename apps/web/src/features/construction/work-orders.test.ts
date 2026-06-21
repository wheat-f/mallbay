import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildConstructionWorkItems,
  getConstructionWorkOrderCounts,
  getVisibleConstructionWorkItems
} from "./work-orders";

test("buildConstructionWorkItems merges pending orders and construction records without losing assigned work", () => {
  const items = buildConstructionWorkItems({
    pendingOrders: [
      { id: "order-pending", orderNo: "ORD-PENDING", appointmentDate: "2026-06-21" }
    ],
    records: [
      {
        id: "record-1",
        orderId: "order-dispatched",
        status: "DISPATCHED",
        order: { orderNo: "ORD-DISPATCHED", appointmentDate: "2026-06-20" },
        assignments: [{ workerUserId: "worker-1" }]
      },
      {
        id: "record-2",
        orderId: "order-active",
        status: "IN_CONSTRUCTION",
        order: { orderNo: "ORD-ACTIVE", appointmentDate: "2026-06-19" },
        assignments: [{ workerUserId: "worker-2" }]
      }
    ]
  });

  assert.deepEqual(items.map((item) => [item.kind, item.status, item.orderId]), [
    ["pending", "PENDING_DISPATCH", "order-pending"],
    ["record", "DISPATCHED", "order-dispatched"],
    ["record", "IN_CONSTRUCTION", "order-active"]
  ]);
});

test("getVisibleConstructionWorkItems filters by construction lifecycle tab", () => {
  const items = buildConstructionWorkItems({
    pendingOrders: [{ id: "order-pending", orderNo: "ORD-PENDING" }],
    records: [
      { id: "record-1", orderId: "order-dispatched", status: "DISPATCHED", order: { orderNo: "ORD-DISPATCHED" } },
      { id: "record-2", orderId: "order-active", status: "IN_CONSTRUCTION", order: { orderNo: "ORD-ACTIVE" } },
      { id: "record-3", orderId: "order-completed", status: "COMPLETED", order: { orderNo: "ORD-COMPLETED" } }
    ]
  });

  assert.deepEqual(getVisibleConstructionWorkItems(items, "pending").map((item) => item.orderNo), ["ORD-PENDING"]);
  assert.deepEqual(getVisibleConstructionWorkItems(items, "dispatched").map((item) => item.orderNo), ["ORD-DISPATCHED"]);
  assert.deepEqual(getVisibleConstructionWorkItems(items, "active").map((item) => item.orderNo), ["ORD-ACTIVE"]);
  assert.deepEqual(getVisibleConstructionWorkItems(items, "completed").map((item) => item.orderNo), ["ORD-COMPLETED"]);
  assert.equal(getVisibleConstructionWorkItems(items, "all").length, 4);
});

test("getConstructionWorkOrderCounts exposes manager console KPIs", () => {
  const items = buildConstructionWorkItems({
    pendingOrders: [{ id: "order-pending", orderNo: "ORD-PENDING" }],
    records: [
      { id: "record-1", orderId: "order-dispatched", status: "DISPATCHED", order: { orderNo: "ORD-DISPATCHED" } },
      { id: "record-2", orderId: "order-active", status: "IN_CONSTRUCTION", order: { orderNo: "ORD-ACTIVE" } },
      { id: "record-3", orderId: "order-completed", status: "COMPLETED", order: { orderNo: "ORD-COMPLETED" } }
    ]
  });

  assert.deepEqual(getConstructionWorkOrderCounts(items), {
    all: 4,
    pending: 1,
    dispatched: 1,
    active: 1,
    completed: 1
  });
});

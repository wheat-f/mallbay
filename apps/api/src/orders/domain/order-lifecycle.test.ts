import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatus } from "@prisma/client";
import { OrderLifecycle } from "./order-lifecycle";
import { finalizeOrderDelivery } from "./order-delivery";

const lifecycleAccess = { can: async () => true };

test("OrderLifecycle exposes the single workflow derivation seam", () => {
  const result = new OrderLifecycle().derive({
    status: OrderStatus.PENDING_DISPATCH,
    amount: { paidAmountCents: 0, outstandingCents: 1000 }
  });

  assert.equal(result.paymentStatus, "UNPAID");
  assert.equal(result.currentStage, "PENDING_INVENTORY_CONFIRM");
  assert.equal(result.capabilities.canCompleteOrder, false);
});

test("OrderLifecycle exposes lifecycle and capability queries without leaking derivation terminology", () => {
  const lifecycle = new OrderLifecycle();
  const input = { status: OrderStatus.PENDING_DISPATCH } as never;
  const result = lifecycle.getLifecycle(input);
  assert.deepEqual(lifecycle.getCapabilities(input), result.capabilities);
  assert.deepEqual(
    lifecycle.listCapabilities([{ id: "order-1", workflow: input }]),
    { "order-1": result.capabilities }
  );
});

test("OrderLifecycle routes order creation through the unified seam", async () => {
  const lifecycle = new OrderLifecycle({
    execute: async (...args: unknown[]) => ({ args })
  } as never);
  assert.deepEqual(await lifecycle.createOrder("actor" as never, "dto" as never), {
    args: ["actor", "dto"]
  });
});

test("OrderLifecycle transition rejects missing implementation instead of pretending to mutate", async () => {
  await assert.rejects(
    () => new OrderLifecycle().transition({ id: "actor-1", isAuditor: false } as never, "order-1", { type: "CANCEL", reason: "" }),
    /transition implementation is not configured/
  );
});

test("OrderLifecycle transition owns cancellation transaction and audit", async () => {
  const events: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.PENDING_DISPATCH }),
      update: async (args: unknown) => { updates.push(args); return { id: "order-1", status: OrderStatus.CANCELLED }; }
    },
    notification: { updateMany: async () => ({ count: 1 }) },
    auditEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); } }
  };
  const lifecycle = new OrderLifecycle(undefined, { $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as never, undefined, lifecycleAccess as never);
  const result = await lifecycle.transition({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" as never } }, "order-1", { type: "CANCEL", reason: "客户取消" });
  assert.deepEqual(result, { id: "order-1", status: OrderStatus.CANCELLED });
  assert.equal(updates.length, 1);
  assert.equal(events.length, 1);
});

test("OrderLifecycle transition owns return-to-dispatch transaction and audit", async () => {
  const events: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.IN_CONSTRUCTION }),
      update: async () => ({ id: "order-1", status: OrderStatus.PENDING_DISPATCH })
    },
    auditEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); } }
  };
  const lifecycle = new OrderLifecycle(undefined, { $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as never, undefined, lifecycleAccess as never);
  const result = await lifecycle.transition({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" as never } }, "order-1", { type: "RETURN_TO_PENDING_DISPATCH", reason: "补充订单信息" });
  assert.deepEqual(result, { id: "order-1", status: OrderStatus.PENDING_DISPATCH });
  assert.equal(events.length, 1);
});

test("OrderLifecycle transition owns final delivery and produces one warranty/audit result", async () => {
  const events: unknown[] = [];
  const notifications: unknown[] = [];
  let orderReads = 0;
  const tx = {
    order: {
      findUnique: async () => orderReads++ === 0
        ? { id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.PENDING_DELIVERY }
        : {
          id: "order-1", storeId: "store-1", customerId: "customer-1", vehicleId: "vehicle-1",
          status: OrderStatus.PENDING_DELIVERY,
          amount: { outstandingCents: 0 },
          items: [{ product: { warrantyYears: 1 } }],
          constructionRecord: { qualityResult: "PASS", photos: [] },
          warranty: null
        },
      updateMany: async () => ({ count: 1 })
    },
    warranty: { create: async () => ({ id: "warranty-1" }) },
    auditEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); } },
    notification: { updateMany: async (args: unknown) => { notifications.push(args); } }
  };
  const lifecycle = new OrderLifecycle(undefined, { $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as never, undefined, lifecycleAccess as never);
  const result = await lifecycle.transition({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" as never } }, "order-1", { type: "FINAL_DELIVERY" });
  assert.deepEqual(result, { orderId: "order-1", warrantyId: "warranty-1", status: "COMPLETED" });
  assert.equal(events.length, 1);
  assert.equal(notifications.length, 1);
});

test("OrderLifecycle delegates construction transitions through the registered handler", async () => {
  const calls: unknown[] = [];
  const lifecycle = new OrderLifecycle();
  lifecycle.registerConstructionHandler(async (...args: unknown[]) => {
    calls.push(args);
    return { accepted: true };
  });
  const result = await lifecycle.transition(
    { id: "worker-1", isAuditor: false } as never,
    "order-1",
    { type: "START_CONSTRUCTION", input: { startedAt: "2026-08-07T09:00:00.000Z" } }
  );
  assert.deepEqual(result, { accepted: true });
  assert.equal(calls.length, 1);
});

test("final delivery rejects incomplete quality or balance facts instead of silently returning", async () => {
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        status: OrderStatus.IN_CONSTRUCTION,
        amount: { outstandingCents: 100 },
        constructionRecord: { qualityResult: null },
        items: [],
        warranty: null
      })
    }
  };

  await assert.rejects(
    () => finalizeOrderDelivery(tx as never, "order-1", "manager-1"),
    /质检未通过/
  );
});

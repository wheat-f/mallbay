import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatus } from "@prisma/client";
import { OrderLifecycle } from "./order-lifecycle";
import { finalizeOrderDelivery } from "./order-delivery";

const lifecycleAccess = { can: async () => true };
const noConstructionWrites = { assertAccess: async () => undefined, execute: async () => { throw new Error("unexpected construction write"); } };

function makeLifecycle(prisma: unknown = {}) {
  return new OrderLifecycle(
    {} as never,
    prisma as never,
    lifecycleAccess as never,
    noConstructionWrites as never
  );
}

test("OrderLifecycle exposes the single workflow derivation seam", () => {
  const result = makeLifecycle().getLifecycle({
    status: OrderStatus.PENDING_DISPATCH,
    amount: { paidAmountCents: 0, outstandingCents: 1000 }
  });

  assert.equal(result.paymentStatus, "UNPAID");
  assert.equal(result.currentStage, "PENDING_INVENTORY_CONFIRM");
  assert.equal(result.capabilities.canCompleteOrder, false);
});

test("OrderLifecycle exposes lifecycle and capability queries without leaking derivation terminology", () => {
  const lifecycle = makeLifecycle();
  const input = { status: OrderStatus.PENDING_DISPATCH } as never;
  const result = lifecycle.getLifecycle(input);
  assert.deepEqual(lifecycle.getCapabilities(input), result.capabilities);
  assert.deepEqual(
    lifecycle.listCapabilities([{ id: "order-1", workflow: input }]),
    { "order-1": result.capabilities }
  );
});

test("OrderLifecycle routes order creation through the unified seam", async () => {
  await assert.rejects(
    () => makeLifecycle().createOrder("actor" as never, { commandId: "", source: "WEB" }, { source: "DIRECT", order: {} as never }),
    /履约命令标识/
  );
});

test("OrderLifecycle transition rejects incomplete cancellation before touching facts", async () => {
  await assert.rejects(
    () => makeLifecycle().transition({ id: "actor-1", isAuditor: false } as never, "order-1", { type: "CANCEL", reason: "" }, { commandId: "cancel-missing-reason", expectedVersion: 1, source: "WEB" }),
    /必须填写原因/
  );
});

test("OrderLifecycle keeps attempted notification intents on a rolled-back command", async () => {
  const observations: Array<{ rolledBack: boolean; notificationIntentCount: number | null }> = [];
  const prisma = {
    order: { findUnique: async () => ({ id: "order-1", storeId: "store-1", executionStoreId: "store-1", salesPersonId: "sales-1", status: OrderStatus.PENDING_DISPATCH, lifecycleVersion: 1 }) },
    orderLifecycleCommandRecord: { findUnique: async () => null },
    orderLifecycleVerificationCase: { findFirst: async () => null },
    $transaction: async (run: (tx: unknown) => unknown) => run({
      orderLifecycleCommandRecord: { create: async () => ({ id: "command-record-rollback" }) },
      order: { findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.PENDING_DISPATCH, lifecycleVersion: 1 }) },
      notification: { createMany: async () => ({ count: 2 }) }
    })
  };
  const lifecycle = new OrderLifecycle(
    {} as never,
    prisma as never,
    lifecycleAccess as never,
    {
      assertAccess: async () => undefined,
      execute: async (tx: { notification: { createMany: (args: unknown) => Promise<unknown> } }) => {
        await tx.notification.createMany({ data: [{ userId: "user-1" }, { userId: "user-2" }] });
        throw new Error("construction write failed");
      }
    } as never,
    { record: (event: { rolledBack: boolean; notificationIntentCount: number | null }) => observations.push(event) } as never
  );

  await assert.rejects(
    () => lifecycle.transition(
      { id: "worker-1", isAuditor: false, storeMember: { storeId: "store-1", position: "WORKER" as never } },
      "order-1",
      { type: "DISPATCH", input: {} },
      { commandId: "dispatch-rollback-1", expectedVersion: 1, source: "CONSTRUCTION_WEB" }
    ),
    /construction write failed/
  );
  assert.deepEqual(observations.map(({ rolledBack, notificationIntentCount }) => ({ rolledBack, notificationIntentCount })), [{ rolledBack: true, notificationIntentCount: 2 }]);
});

test("OrderLifecycle transition owns cancellation transaction and audit", async () => {
  const events: unknown[] = [];
  const updates: unknown[] = [];
  const commandCreates: unknown[] = [];
  const commandUpdates: unknown[] = [];
  const versionChanges: unknown[] = [];
  const tx = {
    orderLifecycleCommandRecord: {
      create: async (args: unknown) => { commandCreates.push(args); return { id: "command-record-1" }; },
      update: async (args: unknown) => { commandUpdates.push(args); return args; }
    },
    orderLifecycleVersionChange: { create: async (args: unknown) => { versionChanges.push(args); return args; } },
    order: {
      findUnique: async (args: { select?: { payments?: unknown } }) => args.select?.payments
        ? { payments: [], constructionRecord: null, inventoryAllocations: [] }
        : { id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.PENDING_DISPATCH, lifecycleVersion: 2 },
      updateMany: async (args: unknown) => { updates.push(args); return { count: 1 }; }
    },
    notification: { updateMany: async () => ({ count: 1 }) },
    constructionAssignment: { deleteMany: async () => ({ count: 0 }) },
    constructionRecord: { updateMany: async () => ({ count: 0 }) },
    crossStoreConstructionTask: { updateMany: async () => ({ count: 0 }) },
    orderInventoryAllocation: { findMany: async () => [] },
    capacityReservation: { findFirst: async () => null, findUnique: async () => null },
    inventoryBatch: { update: async () => ({}) },
    inventoryMovement: { create: async () => ({}) },
    auditEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); } }
  };
  const prisma = {
    order: { findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1" }) },
    orderLifecycleCommandRecord: { findUnique: async () => null },
    orderLifecycleVerificationCase: { findFirst: async () => null },
    $transaction: async (run: (tx: unknown) => unknown) => run(tx)
  };
  const lifecycle = makeLifecycle(prisma);
  const result = await lifecycle.transition(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" as never } },
    "order-1",
    { type: "CANCEL", reason: "客户取消" },
    { commandId: "cancel-1", expectedVersion: 2, source: "WEB" }
  );
  assert.deepEqual(result, { id: "order-1", status: OrderStatus.CANCELLED });
  assert.equal(updates.length, 1);
  assert.equal(events.length, 1);
  assert.equal((commandCreates[0] as { data: { inputSummary: { caller: string } } }).data.inputSummary.caller, "WEB");
  assert.equal(commandUpdates.length, 1);
  assert.equal(versionChanges.length, 1);
});

test("OrderLifecycle transition owns return-to-dispatch transaction and audit", async () => {
  const events: unknown[] = [];
  const versionChanges: unknown[] = [];
  const tx = {
    orderLifecycleCommandRecord: { create: async () => ({ id: "command-record-2" }), update: async (args: unknown) => args },
    orderLifecycleVersionChange: { create: async (args: unknown) => { versionChanges.push(args); return args; } },
    order: {
      findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.DISPATCHED, lifecycleVersion: 4 }),
      updateMany: async () => ({ count: 1 })
    },
    constructionRecord: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    orderInventoryAllocation: { findFirst: async () => null, findMany: async () => [] },
    capacityReservation: { findFirst: async () => null, findUnique: async () => null },
    inventoryBatch: { update: async () => ({}) },
    inventoryMovement: { create: async () => ({}) },
    constructionAssignment: { deleteMany: async () => ({ count: 0 }) },
    crossStoreConstructionTask: { updateMany: async () => ({ count: 0 }) },
    auditEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); } }
  };
  const prisma = {
    order: { findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1" }) },
    orderLifecycleCommandRecord: { findUnique: async () => null },
    orderLifecycleVerificationCase: { findFirst: async () => null },
    $transaction: async (run: (tx: unknown) => unknown) => run(tx)
  };
  const lifecycle = makeLifecycle(prisma);
  const result = await lifecycle.transition(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" as never } },
    "order-1",
    { type: "RETURN_TO_PENDING_DISPATCH", reason: "补充订单信息" },
    { commandId: "return-1", expectedVersion: 4, source: "WEB" }
  );
  assert.deepEqual(result, { id: "order-1", status: OrderStatus.PENDING_DISPATCH });
  assert.equal(events.length, 1);
  assert.equal(versionChanges.length, 1);
});

test("OrderLifecycle transition owns final delivery and produces one warranty/audit result", async () => {
  const events: unknown[] = [];
  const notifications: unknown[] = [];
  let orderReads = 0;
  const tx = {
    orderLifecycleCommandRecord: { create: async () => ({ id: "command-record-3" }), update: async (args: unknown) => args },
    orderLifecycleVersionChange: { create: async (args: unknown) => args },
    order: {
      findUnique: async () => orderReads++ === 0
        ? { id: "order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.PENDING_DISPATCH, lifecycleVersion: 5 }
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
  const prisma = {
    order: { findUnique: async () => ({ id: "order-1", storeId: "store-1", salesPersonId: "sales-1" }) },
    orderLifecycleCommandRecord: { findUnique: async () => null },
    orderLifecycleVerificationCase: { findFirst: async () => null },
    $transaction: async (run: (tx: unknown) => unknown) => run(tx)
  };
  const lifecycle = makeLifecycle(prisma);
  const result = await lifecycle.transition(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" as never } },
    "order-1",
    { type: "FINAL_DELIVERY" },
    { commandId: "final-1", expectedVersion: 5, source: "WEB" }
  );
  assert.deepEqual(result, { orderId: "order-1", warrantyId: "warranty-1", status: "COMPLETED" });
  assert.equal(events.length, 1);
  assert.equal(notifications.length, 1);
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

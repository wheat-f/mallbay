import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatus, RebateStatus, StorePosition } from "@prisma/client";
import { RebatesService } from "./rebates.service";

const rebateAccess = {
  can: async (actor: { userId: string }, capability: string, action: string, context: { ownerId?: string } = {}) => {
    if (capability === "rebates" && action === "apply") return actor.userId.startsWith("manager") || actor.userId.startsWith("cs") || context.ownerId === actor.userId;
    if (capability === "rebates" && action === "review") return actor.userId.startsWith("manager");
    if (capability === "rebates" && action === "pay") return actor.userId.startsWith("finance");
    if (capability === "finance" && action === "write") return actor.userId.startsWith("manager") || actor.userId.startsWith("finance") || context.ownerId === actor.userId;
    return true;
  },
  scope: async (actor: { userId: string }) => ({
    allowed: true,
    global: false,
    storeIds: ["store-1"],
    ...(actor.userId.startsWith("sales") ? { ownerId: actor.userId } : {})
  })
};

test("RebatesService applies approves and pays rebate for paid completed order", async () => {
  const writes: unknown[] = [];
  const reviewedStatus = "REVIEWED" as RebateStatus;
  let currentStatus: RebateStatus = RebateStatus.APPLIED;
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0 }
      })
    },
    customerRebate: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "rebate-1", status: RebateStatus.APPLIED };
      },
      findUnique: async () => ({
        id: "rebate-1",
        storeId: "store-1",
        amountCents: 2000,
        status: currentStatus
      }),
      update: async (args: { data: { status: RebateStatus } }) => {
        writes.push(args);
        currentStatus = args.data.status;
        return { id: "rebate-1", status: currentStatus };
      }
    },
    rebateLog: { create: async (args: unknown) => writes.push(args) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      customerRebate: { update: async (args: { data: { status: RebateStatus } }) => {
        writes.push(args);
        currentStatus = args.data.status;
        return { id: "rebate-1", status: currentStatus };
      } },
      rebateLog: { create: async (args: unknown) => writes.push(args) }
    })
  };
  const finance = {
    recordRebatePayout: async (_tx: unknown, input: unknown) => writes.push({ type: "REBATE", input })
  };
  const service = new RebatesService(prisma as never, rebateAccess as never, finance as never);

  await service.apply(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { orderId: "order-1", amountCents: 2000, reason: "客户返利" }
  );
  await service.approve(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    "rebate-1",
    { status: reviewedStatus, note: "业务审核通过" }
  );
  await service.approve(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "rebate-1",
    { status: RebateStatus.APPROVED, note: "ok" }
  );
  const paid = await service.pay(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "rebate-1",
    { note: "paid" }
  );

  assert.equal(paid.status, RebateStatus.PAID);
  assert.equal(JSON.stringify(writes).includes("REBATE"), true);
});

test("RebatesService delegates payout cash-fact writing to Finance inside the transaction", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findUnique: async () => ({ id: "rebate-1", storeId: "store-1", amountCents: 2000, status: RebateStatus.APPROVED })
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      customerRebate: { update: async () => ({ id: "rebate-1", status: RebateStatus.PAID }) },
      rebateLog: { create: async (args: unknown) => calls.push({ kind: "log", args }) }
    })
  };
  const finance = {
    recordRebatePayout: async (_tx: unknown, input: unknown) => calls.push({ kind: "finance", input })
  };
  const service = new RebatesService(prisma as never, rebateAccess as never, finance as never);

  await service.pay(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "rebate-1",
    { note: "paid" }
  );

  assert.deepEqual(calls, [
    { kind: "log", args: { data: { rebateId: "rebate-1", status: RebateStatus.PAID, note: "paid", createdById: "finance-1" } } },
    {
      kind: "finance",
      input: {
        storeId: "store-1",
        amountCents: 2000,
        sourceId: "rebate-1",
        note: "paid",
        createdById: "finance-1",
        idempotencyKey: "rebate:rebate-1:paid"
      }
    }
  ]);
});

test("RebatesService requires business review before finance approval", async () => {
  const writes: unknown[] = [];
  const reviewedStatus = "REVIEWED" as RebateStatus;
  let currentStatus: RebateStatus = RebateStatus.APPLIED;
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findUnique: async () => ({
        id: "rebate-1",
        storeId: "store-1",
        amountCents: 2000,
        status: currentStatus
      }),
      update: async (args: { data: { status: RebateStatus } }) => {
        writes.push(args);
        currentStatus = args.data.status;
        return { id: "rebate-1", status: currentStatus };
      }
    },
    rebateLog: { create: async (args: unknown) => writes.push(args) }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  const reviewed = await service.approve(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    "rebate-1",
    { status: reviewedStatus, note: "业务审核通过" }
  );
  const approved = await service.approve(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "rebate-1",
    { status: RebateStatus.APPROVED, note: "财务审批通过" }
  );

  assert.equal(reviewed.status, reviewedStatus);
  assert.equal(approved.status, RebateStatus.APPROVED);
  assert.equal(JSON.stringify(writes).includes("业务审核通过"), true);
  assert.equal(JSON.stringify(writes).includes("财务审批通过"), true);
});

test("RebatesService rejects finance approval before business review", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findUnique: async () => ({
        id: "rebate-1",
        storeId: "store-1",
        amountCents: 2000,
        status: RebateStatus.APPLIED
      }),
      update: async () => {
        throw new Error("finance must not approve before business review");
      }
    },
    rebateLog: { create: async () => undefined }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  await assert.rejects(
    () =>
      service.approve(
        { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
        "rebate-1",
        { status: RebateStatus.APPROVED, note: "财务审批通过" }
      ),
    /业务审核后才能财务审批/
  );
});

test("RebatesService rejects manager direct finance approval", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findUnique: async () => ({
        id: "rebate-1",
        storeId: "store-1",
        amountCents: 2000,
        status: RebateStatus.APPLIED
      }),
      update: async () => {
        throw new Error("manager must not set finance approval directly");
      }
    },
    rebateLog: { create: async () => undefined }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  await assert.rejects(
    () =>
      service.approve(
        { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
        "rebate-1",
        { status: RebateStatus.APPROVED, note: "直接通过" }
      ),
    /业务审核通过后由财务审批/
  );
});

test("RebatesService rejects paying rebate before approval", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findUnique: async () => ({
        id: "rebate-1",
        storeId: "store-1",
        amountCents: 2000,
        status: RebateStatus.APPLIED
      }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "rebate-1", status: RebateStatus.PAID };
      }
    },
    rebateLog: { create: async (args: unknown) => writes.push(args) },
    paymentRecord: { create: async (args: unknown) => writes.push(args) }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  await assert.rejects(
    () =>
      service.pay(
        { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
        "rebate-1",
        { note: "paid" }
      ),
    /审批通过后才能发放/
  );

  assert.equal(writes.length, 0);
});

test("RebatesService lets customer service apply rebate for same-store paid completed orders", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0 }
      })
    },
    customerRebate: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "rebate-1", status: RebateStatus.APPLIED };
      }
    }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  const rebate = await service.apply(
    {
      id: "cs-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CUSTOMER_SERVICE }
    },
    { orderId: "order-1", amountCents: 2000, reason: "客服申请返利" }
  );

  assert.equal(rebate.status, RebateStatus.APPLIED);
  assert.equal(writes.length, 1);
});

test("RebatesService lists rebates with order customer and vehicle summary", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  await service.list(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    { storeId: "store-1" }
  );

  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"orderNo"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
});

test("RebatesService rejects sales applying rebate for another sales person's order", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async () => ({
        id: "order-2",
        storeId: "store-1",
        salesPersonId: "sales-2",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0 }
      })
    },
    customerRebate: {
      create: async () => {
        throw new Error("sales should not rebate another sales person's order");
      }
    }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  await assert.rejects(
    () =>
      service.apply(
        { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
        { orderId: "order-2", amountCents: 2000, reason: "客户返利" }
      ),
    /无权限/
  );
});

test("RebatesService limits sales rebate list to their own orders", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    customerRebate: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new RebatesService(prisma as never, rebateAccess as never);

  await service.list(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    order: { salesPersonId: "sales-1" }
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { FinanceQueryService } from "./finance-query.service";

const purchasing = {
  id: "purchasing-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
};
const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
};

function membership(position: StorePosition, storeId = "store-1") {
  return {
    findUnique: async () => ({ storeId, position })
  };
}

function accessContextFor(...allowedIds: string[]) {
  return {
    can: async (actor: string, _capability: string, action: string, context: { storeId?: string; ownerId?: string }) => {
      if (context.storeId !== "store-1") return false;
      if (action === "write") return allowedIds.some((id) => id === actor && (id.startsWith("manager") || id.startsWith("finance")));
      return Boolean(context.ownerId === actor || allowedIds.includes(actor));
    }
  };
}

test("FinanceQueryService scopes mine to the authenticated applicant", async () => {
  let capturedWhere: unknown;
  const prisma = {
    storeMember: membership(StorePosition.PURCHASING),
    expenseApplication: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0
    }
  };
  const service = new FinanceQueryService(prisma as never, accessContextFor("purchasing-1"));

  await service.listExpenses(purchasing, {
    storeId: "store-1",
    scope: "mine",
    page: 1,
    pageSize: 20
  });

  assert.deepEqual(capturedWhere, { storeId: "store-1", applicantId: "purchasing-1" });
});

test("FinanceQueryService rejects all-scope queries for applicants", async () => {
  const prisma = {
    storeMember: membership(StorePosition.PURCHASING),
    expenseApplication: { findMany: async () => [], count: async () => 0 }
  };
  const service = new FinanceQueryService(prisma as never, accessContextFor());

  await assert.rejects(
    () => service.listExpenses(purchasing, { storeId: "store-1", scope: "all", page: 1, pageSize: 20 }),
    /无权限/
  );
});

test("FinanceQueryService allows managers to query all applications", async () => {
  let capturedWhere: unknown;
  const prisma = {
    storeMember: membership(StorePosition.MANAGER),
    expenseApplication: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0
    }
  };
  const service = new FinanceQueryService(prisma as never, accessContextFor("manager-1"));

  await service.listExpenses(manager, { storeId: "store-1", scope: "all", page: 1, pageSize: 20 });
  assert.deepEqual(capturedWhere, { storeId: "store-1" });
});

for (const position of [StorePosition.MANAGER, StorePosition.FINANCE]) {
  test(`FinanceQueryService lets ${position} load ledger records from a bare JWT actor`, async () => {
    let capturedWhere: unknown;
    const prisma = {
      storeMember: membership(position),
      paymentRecord: {
        findMany: async (args: { where: unknown }) => {
          capturedWhere = args.where;
          return [];
        },
        count: async () => 0
      }
    };
    const service = new FinanceQueryService(prisma as never, accessContextFor(`${position.toLowerCase()}-1`));

    await service.listPaymentRecords(
      { id: `${position.toLowerCase()}-1`, isAuditor: false },
      { storeId: "store-1", scope: "all", page: 1, pageSize: 20 }
    );

    assert.deepEqual(capturedWhere, { storeId: "store-1" });
  });
}

test("FinanceQueryService ignores stale embedded membership when checking ledger access", async () => {
  const prisma = {
    storeMember: membership(StorePosition.FINANCE),
    paymentRecord: { findMany: async () => [], count: async () => 0 }
  };
  const service = new FinanceQueryService(prisma as never, accessContextFor("finance-1"));

  await service.listPaymentRecords(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "stale-store", position: StorePosition.SALES }
    },
    { storeId: "store-1", scope: "all", page: 1, pageSize: 20 }
  );
});

test("FinanceQueryService still rejects ledger access outside the actor's current store", async () => {
  const prisma = {
    storeMember: membership(StorePosition.FINANCE, "store-2"),
    paymentRecord: { findMany: async () => [], count: async () => 0 }
  };
  const service = new FinanceQueryService(prisma as never, { can: async () => false });

  await assert.rejects(
    () => service.listPaymentRecords(
      { id: "finance-1", isAuditor: false },
      { storeId: "store-1", scope: "all", page: 1, pageSize: 20 }
    ),
    /无权限/
  );
});

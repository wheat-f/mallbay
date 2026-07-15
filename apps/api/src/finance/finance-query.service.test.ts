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

test("FinanceQueryService scopes mine to the authenticated applicant", async () => {
  let capturedWhere: unknown;
  const prisma = {
    expenseApplication: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0
    }
  };
  const service = new FinanceQueryService(prisma as never);

  await service.listExpenses(purchasing, {
    storeId: "store-1",
    scope: "mine",
    page: 1,
    pageSize: 20
  });

  assert.deepEqual(capturedWhere, { storeId: "store-1", applicantId: "purchasing-1" });
});

test("FinanceQueryService rejects all-scope queries for applicants", async () => {
  const prisma = { expenseApplication: { findMany: async () => [], count: async () => 0 } };
  const service = new FinanceQueryService(prisma as never);

  await assert.rejects(
    () => service.listExpenses(purchasing, { storeId: "store-1", scope: "all", page: 1, pageSize: 20 }),
    /无权限/
  );
});

test("FinanceQueryService allows managers to query all applications", async () => {
  let capturedWhere: unknown;
  const prisma = {
    expenseApplication: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0
    }
  };
  const service = new FinanceQueryService(prisma as never);

  await service.listExpenses(manager, { storeId: "store-1", scope: "all", page: 1, pageSize: 20 });
  assert.deepEqual(capturedWhere, { storeId: "store-1" });
});

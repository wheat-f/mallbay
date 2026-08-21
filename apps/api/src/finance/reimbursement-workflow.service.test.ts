import assert from "node:assert/strict";
import { test } from "node:test";
import { FinanceApprovalStatus, StorePosition } from "@prisma/client";
import { ReimbursementWorkflowService } from "./reimbursement-workflow.service";

const finance = {
  id: "finance-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.FINANCE },
};
const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.MANAGER },
};

const accessContext = {
  can: async (actor: { userId: string }, capability: string, action: string) =>
    capability === "finance.reimbursement" && (action === "review" || action === "pay")
      ? actor.userId === finance.id
      : true,
};

test("ReimbursementWorkflowService separates finance approval from payment", async () => {
  const writes: unknown[] = [];
  const tx = {
    reimbursementApplication: {
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "r-1", status: FinanceApprovalStatus.APPROVED };
      },
    },
    financeApprovalRecord: {
      create: async (args: unknown) => {
        writes.push(args);
        return args;
      },
    },
  };
  const prisma = {
    reimbursementApplication: {
      findUnique: async () => ({
        id: "r-1",
        storeId: "store-1",
        status: FinanceApprovalStatus.PENDING,
        amountCents: 1000,
      }),
    },
    $transaction: async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
  };
  const service = new ReimbursementWorkflowService(prisma as never, accessContext as never);
  const result = await service.review(finance, "r-1", {
    decision: "APPROVE",
    note: "已核验",
  });
  assert.equal(result.status, FinanceApprovalStatus.APPROVED);
  assert.equal(JSON.stringify(writes).includes("PAYMENT"), true);
  await assert.rejects(
    () => service.review(manager, "r-1", { decision: "APPROVE" }),
    /无权限/,
  );
});

test("ReimbursementWorkflowService creates one payment and returns it on repeated pay", async () => {
  let creates = 0;
  const writerInputs: unknown[] = [];
  const payment = { id: "payment-1" };
  const tx = {
    paymentRecord: {
      findFirst: async () => (creates ? payment : null),
      findUnique: async () => payment,
      create: async () => { throw new Error("workflow must not write PaymentRecord directly"); },
    },
    reimbursementApplication: { update: async (args: unknown) => args },
    financeApprovalRecord: { create: async (args: unknown) => args },
  };
  const prisma = {
    reimbursementApplication: {
      findUnique: async () => ({
        id: "r-1",
        storeId: "store-1",
        status: FinanceApprovalStatus.APPROVED,
        amountCents: 1000,
        paymentRecordId: null,
      }),
    },
    paymentAccount: {
      findUnique: async () => ({
        id: "account-1",
        storeId: "store-1",
        isActive: true,
      }),
    },
    paymentRecord: { findUnique: async () => payment },
    $transaction: async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
  };
  const financeWriter = {
    recordReimbursementPayout: async (_tx: unknown, input: unknown) => {
      creates += 1;
      writerInputs.push(input);
      return payment;
    },
  };
  const service = new ReimbursementWorkflowService(prisma as never, accessContext as never, financeWriter as never);
  const first = await service.pay(finance, "r-1", {
    paymentAccountId: "account-1",
    paidAt: "2026-07-13T10:00:00.000Z",
  });
  const second = await service.pay(finance, "r-1", {
    paymentAccountId: "account-1",
  });
  assert.equal(first.paymentRecord.id, "payment-1");
  assert.equal(first.alreadyPaid, false);
  assert.equal(second.paymentRecord.id, "payment-1");
  assert.equal(second.alreadyPaid, true);
  assert.equal(creates, 1);
  assert.deepEqual(writerInputs, [{
    storeId: "store-1",
    accountId: "account-1",
    amountCents: 1000,
    sourceId: "r-1",
    note: "报销打款",
    createdById: "finance-1",
    occurredAt: new Date("2026-07-13T10:00:00.000Z"),
    idempotencyKey: "reimbursement:r-1:paid",
  }]);
});

test("ReimbursementWorkflowService supports applicant withdraw and resubmit", async () => {
  const writes: unknown[] = [];
  const tx = {
    reimbursementApplication: {
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "r-2" };
      },
    },
    financeApprovalRecord: {
      create: async (args: unknown) => {
        writes.push(args);
        return args;
      },
    },
  };
  const prisma = {
    reimbursementApplication: {
      findUnique: async () => ({
        id: "r-2",
        storeId: "store-1",
        applicantId: "manager-1",
        status: FinanceApprovalStatus.PENDING,
      }),
    },
    $transaction: async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
  };
  const service = new ReimbursementWorkflowService(prisma as never, accessContext as never);
  await service.withdraw(manager, "r-2", "改正后重新提交");
  assert.equal(JSON.stringify(writes).includes("WITHDRAWN"), true);

  const rejectedPrisma = {
    reimbursementApplication: {
      findUnique: async () => ({
        id: "r-3",
        storeId: "store-1",
        applicantId: "manager-1",
        status: FinanceApprovalStatus.REJECTED,
      }),
    },
    $transaction: async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
  };
  const rejectedService = new ReimbursementWorkflowService(
    rejectedPrisma as never,
    accessContext as never,
  );
  await rejectedService.resubmit(manager, "r-3", {
    title: "补充费用",
    amountCents: 1200,
    reason: "补充凭证",
  });
  assert.equal(JSON.stringify(writes).includes("RESUBMITTED"), true);
});

test('ReimbursementWorkflowService rejects amounts above linked expense remaining balance', async () => {
  let created = false;
  const tx = {
    reimbursementApplication: { create: async () => { created = true; return { id: 'r-new' }; } },
    financeApprovalRecord: { create: async () => ({}) },
  };
  const prisma = {
    expenseApplication: {
      findUnique: async () => ({ storeId: 'store-1', status: FinanceApprovalStatus.APPROVED, amountCents: 1000 }),
    },
    reimbursementApplication: {
      aggregate: async () => ({ _sum: { amountCents: 700 } }),
    },
    $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx),
  };
  const service = new ReimbursementWorkflowService(prisma as never, accessContext as never);
  await assert.rejects(
    () => service.create(manager, {
      storeId: 'store-1',
      expenseId: 'expense-1',
      title: '超额报销',
      amountCents: 301,
      reason: '测试',
    }),
    /剩余额度/,
  );
  assert.equal(created, false);
});

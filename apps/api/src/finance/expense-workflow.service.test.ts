import assert from "node:assert/strict";
import { test } from "node:test";
import { FinanceApprovalStatus, StorePosition } from "@prisma/client";
import { ExpenseWorkflowService } from "./expense-workflow.service";

const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
};
const applicant = {
  id: "purchasing-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
};
const finance = {
  id: "finance-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
};

const accessContext = {
  can: async (actorId: string, capability: string, action: string) =>
    capability === "finance.expense" && action === "review"
      ? actorId === manager.id
      : true,
};

function createPrisma(expense: Record<string, unknown>) {
  const writes: unknown[] = [];
  const tx = {
    expenseApplication: {
      create: async (args: unknown) => { writes.push(args); return expense; },
      findUnique: async () => expense,
      update: async (args: unknown) => { writes.push(args); return { ...expense, ...((args as { data: object }).data) }; }
    },
    financeApprovalRecord: { create: async (args: unknown) => { writes.push(args); return args; } }
  };
  return {
    prisma: {
      storeMember: { findUnique: async () => ({ storeId: "store-1", position: StorePosition.MANAGER }) },
      expenseApplication: { findUnique: async () => expense },
      $transaction: async <T>(callback: (value: typeof tx) => Promise<T>) => callback(tx)
    },
    writes
  };
}

test("ExpenseWorkflowService creates and records a pending expense", async () => {
  const { prisma, writes } = createPrisma({ id: "expense-1", storeId: "store-1", applicantId: applicant.id, status: FinanceApprovalStatus.PENDING });
  const service = new ExpenseWorkflowService(prisma as never, accessContext as never);
  await service.create(applicant, { storeId: "store-1", title: "耗材", amountCents: 1000, reason: "施工" });
  assert.equal(writes.length, 2);
  assert.match(JSON.stringify(writes), /MANAGER_REVIEW/);
});

test("ExpenseWorkflowService resolves the current user's store membership before creating", async () => {
  const { prisma, writes } = createPrisma({ id: "expense-1", storeId: "store-1", applicantId: "manager-1", status: FinanceApprovalStatus.PENDING });
  const service = new ExpenseWorkflowService(prisma as never, accessContext as never);

  await service.create(
    { id: "manager-1", isAuditor: false },
    { storeId: "store-1", title: "门店耗材", amountCents: 1000, reason: "施工使用" }
  );

  assert.equal(writes.length, 2);
});

test("ExpenseWorkflowService only lets manager approve and never accepts PAID", async () => {
  const { prisma } = createPrisma({ id: "expense-1", storeId: "store-1", applicantId: applicant.id, status: FinanceApprovalStatus.PENDING });
  const service = new ExpenseWorkflowService(prisma as never, accessContext as never);
  await assert.rejects(() => service.review(finance, "expense-1", { decision: "APPROVE" }), /无权限/);
  await service.review(manager, "expense-1", { decision: "APPROVE" });
  await assert.rejects(() => service.review(manager, "expense-1", { decision: "PAID" as never }), /只支持通过或驳回/);
});

test("ExpenseWorkflowService allows applicant withdrawal only while pending", async () => {
  const { prisma } = createPrisma({ id: "expense-1", storeId: "store-1", applicantId: applicant.id, status: FinanceApprovalStatus.APPROVED });
  const service = new ExpenseWorkflowService(prisma as never, accessContext as never);
  await assert.rejects(() => service.withdraw(applicant, "expense-1", "不再发生"), /只有待审批费用可以撤回/);
});

test("ExpenseWorkflowService resubmits rejected applications", async () => {
  const { prisma, writes } = createPrisma({ id: "expense-1", storeId: "store-1", applicantId: applicant.id, status: FinanceApprovalStatus.REJECTED });
  const service = new ExpenseWorkflowService(prisma as never, accessContext as never);
  await service.resubmit(applicant, "expense-1", { title: "重新申请", amountCents: 1200, reason: "补充说明" });
  assert.match(JSON.stringify(writes), /RESUBMITTED/);
});

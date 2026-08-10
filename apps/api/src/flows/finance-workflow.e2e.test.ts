import assert from "node:assert/strict";
import { test } from "node:test";
import { FinanceApprovalStatus, StorePosition } from "@prisma/client";
import { ExpenseWorkflowService } from "../finance/expense-workflow.service";
import { FinanceService } from "../finance/finance.service";
import { FinanceQueryService } from "../finance/finance-query.service";
import { ReimbursementWorkflowService } from "../finance/reimbursement-workflow.service";

const applicant = {
  id: "applicant-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.PURCHASING },
};
const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.MANAGER },
};
const finance = {
  id: "finance-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.FINANCE },
};

function createFinanceMemory() {
  const expenses: any[] = [];
  const reimbursements: any[] = [];
  const payments: any[] = [];
  const approvals: any[] = [];
  const members = new Map([
    [applicant.id, applicant.storeMember],
    [manager.id, manager.storeMember],
    [finance.id, finance.storeMember],
  ]);
  let sequence = 0;
  const id = (prefix: string) => `${prefix}-${++sequence}`;
  const prisma: any = {
    storeMember: {
      findUnique: async ({ where }: any) => members.get(where.userId) ?? null,
    },
    expenseApplication: {
      create: async ({ data }: any) => {
        const row = { id: id("expense"), createdAt: new Date(), ...data };
        expenses.push(row);
        return row;
      },
      findUnique: async ({ where }: any) =>
        expenses.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = expenses.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => expenses,
      count: async () => expenses.length,
    },
    reimbursementApplication: {
      create: async ({ data }: any) => {
        const row = { id: id("reimbursement"), createdAt: new Date(), ...data };
        reimbursements.push(row);
        return row;
      },
      findUnique: async ({ where }: any) =>
        reimbursements.find((row) => row.id === where.id) ?? null,
      aggregate: async ({ where }: any) => ({
        _sum: {
          amountCents: reimbursements
            .filter((row) => row.expenseId === where.expenseId && where.status.in.includes(row.status))
            .reduce((sum, row) => sum + row.amountCents, 0),
        },
      }),
      update: async ({ where, data }: any) => {
        const row = reimbursements.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => reimbursements,
      count: async () => reimbursements.length,
    },
    paymentAccount: {
      findUnique: async () => ({
        id: "account-1",
        storeId: "store-1",
        isActive: true,
      }),
    },
    paymentRecord: {
      create: async ({ data }: any) => {
        const row = { id: id("payment"), ...data };
        payments.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        payments.find(
          (row) => row.sourceId === where.sourceId && row.type === where.type,
        ) ?? null,
      findUnique: async ({ where }: any) =>
        payments.find((row) => row.id === where.id) ?? null,
      findMany: async () => payments,
      count: async () => payments.length,
    },
    financeApprovalRecord: {
      create: async ({ data }: any) => {
        const row = { id: id("approval"), createdAt: new Date(), ...data };
        approvals.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        approvals.filter((row) => row.applicationId === where.applicationId),
    },
    financeAttachment: { findMany: async () => [] },
    $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
  };
  return { prisma, expenses, reimbursements, payments, approvals };
}

test("finance workflow closes from expense submission to one payment ledger record", async () => {
  const memory = createFinanceMemory();
  const accessContext = { can: async () => true };
  const expenseWorkflow = new ExpenseWorkflowService(memory.prisma, accessContext as never);
  const financeWriter = new FinanceService(memory.prisma);
  const reimbursementWorkflow = new ReimbursementWorkflowService(memory.prisma, accessContext as never, financeWriter);
  const query = new FinanceQueryService(memory.prisma, { can: async () => true } as never);

  const expense = await expenseWorkflow.create(applicant, {
    storeId: "store-1",
    title: "施工耗材",
    amountCents: 3000,
    reason: "门店施工",
  });
  assert.equal(expense.status, FinanceApprovalStatus.PENDING);
  await expenseWorkflow.review(manager, expense.id, {
    decision: "APPROVE",
    note: "预算已核验",
  });

  const reimbursement = await reimbursementWorkflow.create(applicant, {
    storeId: "store-1",
    expenseId: expense.id,
    title: "施工耗材报销",
    amountCents: 3000,
    reason: "凭证齐全",
  });
  await reimbursementWorkflow.review(finance, reimbursement.id, {
    decision: "APPROVE",
    note: "财务已核验",
  });
  await reimbursementWorkflow.pay(finance, reimbursement.id, {
    paymentAccountId: "account-1",
  });
  await reimbursementWorkflow.pay(finance, reimbursement.id, {
    paymentAccountId: "account-1",
  });

  const detail = await query.getReimbursementDetail(finance, reimbursement.id);
  const records = memory.payments.filter(
    (record) => record.sourceId === reimbursement.id,
  );
  assert.equal(detail.status, FinanceApprovalStatus.PAID);
  assert.equal(records.length, 1);
  assert.equal(records[0].direction, "EXPENSE");
  assert.equal(
    memory.approvals.filter(
      (record) => record.applicationId === reimbursement.id,
    ).length,
    3,
  );
});

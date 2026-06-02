import assert from "node:assert/strict";
import { test } from "node:test";
import { FinanceApprovalStatus, PaymentRecordType, StorePosition } from "@prisma/client";
import { FinanceService } from "./finance.service";

test("FinanceService creates expense and approves reimbursement with payment record", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    expenseApplication: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "expense-1", status: FinanceApprovalStatus.PENDING };
      }
    },
    reimbursementApplication: {
      findUnique: async () => ({ id: "reimbursement-1", storeId: "store-1", amountCents: 3000 }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "reimbursement-1", status: FinanceApprovalStatus.APPROVED };
      }
    },
    paymentRecord: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "payment-record-1" };
      }
    }
  };
  const service = new FinanceService(prisma as never);

  await service.createExpense(
    { id: "purchasing-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.PURCHASING } },
    { storeId: "store-1", title: "耗材采购", amountCents: 3000, reason: "施工耗材" }
  );
  await service.approveReimbursement(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "reimbursement-1",
    { status: FinanceApprovalStatus.APPROVED, note: "ok" }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes(FinanceApprovalStatus.PENDING), true);
  assert.equal(serialized.includes(PaymentRecordType.REIMBURSEMENT), true);
});

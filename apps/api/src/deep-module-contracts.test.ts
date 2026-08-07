import assert from "node:assert/strict";
import { test } from "node:test";
import { CustomerAccount } from "./customers/domain/customer-account";
import { SettlementView } from "./customer-settlements/domain/settlement-view";
import { FinancialDocument } from "./finance/domain/financial-document";
import { NotificationDispatcher } from "./notifications/notification-dispatcher";
import { PricingDecision } from "./pricing/domain/pricing-decision";

test("P1/P2 module seams delegate business calls without exposing implementations", async () => {
  const pricing = new PricingDecision({
    calculate: async () => ({ snapshotId: "snapshot-1" }),
    validateOrder: async (_user: unknown, input: unknown) => ({ validated: true, input })
  } as never);
  assert.deepEqual(await pricing.decide({} as never, {} as never), { snapshotId: "snapshot-1" });
  assert.deepEqual(
    await pricing.validateOrder({} as never, { pricingCalculationId: "calculation-1" } as never),
    { validated: true, input: { pricingCalculationId: "calculation-1" } }
  );

  const customer = new CustomerAccount({ detail: async () => ({ id: "customer-1" }) } as never);
  assert.deepEqual(await customer.getCustomerSummary({} as never, "customer-1"), { id: "customer-1" });

  const settlement = new SettlementView({ listStatements: async () => ({ items: [] }) } as never);
  assert.deepEqual(await settlement.getSettlementView({} as never, {} as never), { items: [] });

  const finance = new FinancialDocument({
    getExpenseDetail: async () => ({ kind: "expense" }),
    getReimbursementDetail: async () => ({ kind: "reimbursement" }),
    listPaymentRecords: async () => ({ items: [] })
  } as never);
  assert.deepEqual(await finance.getDocumentView({} as never, { kind: "expense", id: "expense-1" }), { kind: "expense" });
  assert.deepEqual(await finance.listCashFacts({} as never, {} as never), { items: [] });
  const tracedFinance = new FinancialDocument({
    getExpenseDetail: async () => ({ reimbursements: [{ id: "reimbursement-1", amountCents: 100, status: "PAID", paymentRecordId: "payment-1" }] }),
    getReimbursementDetail: async () => ({ expenseId: "expense-1", paymentRecord: { id: "payment-1" } })
  } as never);
  assert.deepEqual(await tracedFinance.traceSource({} as never, { kind: "expense", id: "expense-1" }), {
    document: { kind: "expense", id: "expense-1" },
    source: { kind: "expense", id: "expense-1" },
    reimbursements: [{ id: "reimbursement-1", amountCents: 100, status: "PAID", paymentRecordId: "payment-1" }],
    cashFacts: []
  });

  const notifications = new NotificationDispatcher({
    send: async () => ({ id: "notification-1" })
  } as never);
  assert.deepEqual(
    await notifications.dispatch({ userId: "user-1", type: "ORDER_BALANCE_DUE" as never, payload: { orderId: "order-1" } }),
    { id: "notification-1" }
  );
});

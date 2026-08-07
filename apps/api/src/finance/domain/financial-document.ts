import { Injectable } from "@nestjs/common";
import { FinanceQueryService } from "../finance-query.service";

type FinanceActor = Parameters<FinanceQueryService["getExpenseDetail"]>[0];

/** Read seam for financial document state, cash facts and source trace. */
@Injectable()
export class FinancialDocument {
  constructor(private readonly implementation: FinanceQueryService) {}

  getDocumentView(user: FinanceActor, input: { kind: "expense" | "reimbursement"; id: string }) {
    return input.kind === "expense"
      ? this.implementation.getExpenseDetail(user, input.id)
      : this.implementation.getReimbursementDetail(user, input.id);
  }

  listCashFacts(user: FinanceActor, query: Parameters<FinanceQueryService["listPaymentRecords"]>[1]) {
    return this.implementation.listPaymentRecords(user, query);
  }

  async traceSource(
    user: FinanceActor,
    input: { kind: "expense" | "reimbursement"; id: string }
  ) {
    if (input.kind === "expense") {
      const document = await this.implementation.getExpenseDetail(user, input.id);
      return {
        document: { kind: input.kind, id: input.id },
        source: { kind: "expense", id: input.id },
        reimbursements: document.reimbursements.map((item) => ({
          id: item.id,
          amountCents: item.amountCents,
          status: item.status,
          paymentRecordId: item.paymentRecordId
        })),
        cashFacts: []
      };
    }

    const document = await this.implementation.getReimbursementDetail(user, input.id);
    return {
      document: { kind: input.kind, id: input.id },
      source: document.expenseId
        ? { kind: "expense", id: document.expenseId }
        : null,
      reimbursements: [],
      cashFacts: document.paymentRecord ? [document.paymentRecord] : []
    };
  }
}

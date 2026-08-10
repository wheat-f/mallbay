import { Injectable } from "@nestjs/common";
import { CustomerSettlementsService, type AuthenticatedSettlementUser } from "../customer-settlements.service";
import type {
  ListCustomerReceiptsDto,
  ListCustomerStatementsDto,
  ListStatementCandidatesDto
} from "../dto/customer-settlement.dto";

export type SettlementStatement = {
  id: string;
  statementNo: string;
  storeId: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  receivableCents: number;
  receivedCents: number;
  outstandingCents: number;
  status: string;
  confirmedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  customer: { id: string; name: string | null; companyName: string | null; customerType: string } | null;
  confirmedBy: { id: string; username: string | null; nickname: string | null } | null;
  items: Array<{
    id: string;
    orderAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
    order: {
      id: string;
      orderNo: string;
      status: string;
      createdAt: string;
      vehicle: { id: string; carPlate: string | null; brand: string | null; model: string | null; department: string | null } | null;
      contactSnapshot: { contactName: string | null; role: string | null; department: string | null } | null;
    };
  }>;
  settlement: {
    settlementPeriod: { start: string; end: string };
    includedOrderIds: string[];
    receivableCents: number;
    collectedCents: number;
    outstandingCents: number;
    allocationIds: string[];
  };
};

export type SettlementViewResult = {
  items: SettlementStatement[];
  semantics: {
    dateBasis: "ORDER_CREATED_AT";
    includedOrderKinds: ["COMPLETED", "WARRANTIED"];
    amountTypes: {
      receivable: "ORDER_TOTAL";
      collected: "ORDER_PAID";
      outstanding: "ORDER_OUTSTANDING";
    };
    allocationType: "CUSTOMER_STATEMENT_ITEM";
  };
  generatedAt: string;
};

export type SettlementCandidateViewResult = {
  items: Array<{
    id: string;
    orderNo: string;
    status: string;
    createdAt: string;
    appointmentDate: string | null;
    vehicle: { id: string; carPlate: string | null; carModel: string | null; department: string | null } | null;
    contactSnapshot: { contactName: string | null; role: string | null; department: string | null } | null;
    amount: { totalAmountCents: number; paidAmountCents: number; outstandingCents: number } | null;
    constructionRecord: { completedAt: string | null } | null;
  }>;
  semantics: {
    dateBasis: "ORDER_CREATED_AT";
    includedOrderKinds: ["COMPLETED", "WARRANTIED"];
    amountTypes: {
      receivable: "ORDER_TOTAL";
      collected: "ORDER_PAID";
      outstanding: "ORDER_OUTSTANDING";
    };
  };
  generatedAt: string;
};

export type SettlementReceiptViewResult = {
  items: Array<{
    id: string;
    receiptNo: string;
    storeId: string;
    customerId: string;
    accountId: string;
    amountCents: number;
    receivedAt: string;
    payerName: string | null;
    bankSerialNo: string | null;
    note: string | null;
    status: string;
    createdAt: string;
    reversedAmountCents: number;
    reversibleAmountCents: number;
    account: { id: string; name: string; type: string } | null;
    createdBy: { id: string; username: string | null; nickname: string | null } | null;
    allocations: Array<{
      id: string;
      orderId: string;
      amountCents: number;
      order: { id: string; orderNo: string; vehicle: { carPlate: string | null; carModel: string | null } | null };
      reversalAllocations: Array<{ amountCents: number }>;
    }>;
    reversals: Array<{
      id: string;
      amountCents: number;
      reason: string;
      createdAt: string;
      createdBy: { id: string; username: string | null; nickname: string | null } | null;
    }>;
  }>;
  semantics: {
    dateBasis: "RECEIVED_AT";
    includedOrderKinds: ["COMPLETED", "WARRANTIED"];
    amountTypes: {
      collected: "RECEIPT_AMOUNT";
      allocated: "ORDER_PAYMENT";
      reversed: "REVERSAL_AMOUNT";
    };
    allocationType: "ORDER_PAYMENT";
  };
  generatedAt: string;
};

/** Read-only enterprise settlement projection seam. */
@Injectable()
export class SettlementView {
  constructor(private readonly implementation: CustomerSettlementsService) {}

  async getSettlementView(
    user: AuthenticatedSettlementUser,
    query: ListCustomerStatementsDto
  ): Promise<SettlementViewResult> {
    const statements = await this.implementation.listStatements(user, query);
    return {
      items: statements.map((statement) => ({
        id: statement.id,
        statementNo: statement.statementNo,
        storeId: statement.storeId,
        customerId: statement.customerId,
        periodStart: statement.periodStart.toISOString(),
        periodEnd: statement.periodEnd.toISOString(),
        receivableCents: statement.receivableCents,
        receivedCents: statement.receivedCents,
        outstandingCents: statement.outstandingCents,
        status: statement.status,
        confirmedAt: statement.confirmedAt?.toISOString() ?? null,
        voidReason: statement.voidReason ?? null,
        createdAt: statement.createdAt.toISOString(),
        customer: statement.customer,
        confirmedBy: statement.confirmedBy,
        items: statement.items.map((item) => ({
          id: item.id,
          orderAmountCents: item.orderAmountCents,
          paidAmountCents: item.paidAmountCents,
          outstandingCents: item.outstandingCents,
          order: {
            id: item.order.id,
            orderNo: item.order.orderNo,
            status: item.order.status,
            createdAt: item.order.createdAt.toISOString(),
            vehicle: item.order.vehicle,
            contactSnapshot: item.order.contactSnapshot
          }
        })),
        settlement: {
          settlementPeriod: {
            start: statement.periodStart.toISOString(),
            end: statement.periodEnd.toISOString()
          },
          includedOrderIds: statement.items.map((item) => item.order.id),
          receivableCents: statement.receivableCents,
          collectedCents: statement.receivedCents,
          outstandingCents: statement.outstandingCents,
          allocationIds: statement.items.map((item) => item.id)
        }
      })),
      semantics: {
        dateBasis: "ORDER_CREATED_AT",
        includedOrderKinds: ["COMPLETED", "WARRANTIED"],
        amountTypes: {
          receivable: "ORDER_TOTAL",
          collected: "ORDER_PAID",
          outstanding: "ORDER_OUTSTANDING"
        },
        allocationType: "CUSTOMER_STATEMENT_ITEM"
      },
      generatedAt: new Date().toISOString()
    };
  }

  async listCandidateOrders(
    user: AuthenticatedSettlementUser,
    query: ListStatementCandidatesDto
  ): Promise<SettlementCandidateViewResult> {
    const candidates = await this.implementation.listStatementCandidates(user, query);
    return {
      items: candidates.map((candidate) => ({
        id: candidate.id,
        orderNo: candidate.orderNo,
        status: candidate.status,
        createdAt: candidate.createdAt.toISOString(),
        appointmentDate: candidate.appointmentDate?.toISOString() ?? null,
        vehicle: candidate.vehicle,
        contactSnapshot: candidate.contactSnapshot,
        amount: candidate.amount,
        constructionRecord: candidate.constructionRecord
          ? { completedAt: candidate.constructionRecord.completedAt?.toISOString() ?? null }
          : null
      })),
      semantics: {
        dateBasis: "ORDER_CREATED_AT",
        includedOrderKinds: ["COMPLETED", "WARRANTIED"],
        amountTypes: {
          receivable: "ORDER_TOTAL",
          collected: "ORDER_PAID",
          outstanding: "ORDER_OUTSTANDING"
        }
      },
      generatedAt: new Date().toISOString()
    };
  }

  getStatement(user: AuthenticatedSettlementUser, id: string) {
    return this.implementation.getStatement(user, id);
  }

  async listReceipts(
    user: AuthenticatedSettlementUser,
    query: ListCustomerReceiptsDto
  ): Promise<SettlementReceiptViewResult> {
    const receipts = await this.implementation.listReceipts(user, query);
    return {
      items: receipts.map((receipt) => ({
        id: receipt.id,
        receiptNo: receipt.receiptNo,
        storeId: receipt.storeId,
        customerId: receipt.customerId,
        accountId: receipt.accountId,
        amountCents: receipt.amountCents,
        receivedAt: receipt.receivedAt.toISOString(),
        payerName: receipt.payerName,
        bankSerialNo: receipt.bankSerialNo,
        note: receipt.note,
        status: receipt.status,
        createdAt: receipt.createdAt.toISOString(),
        reversedAmountCents: receipt.reversedAmountCents,
        reversibleAmountCents: receipt.reversibleAmountCents,
        account: receipt.account,
        createdBy: receipt.createdBy,
        allocations: receipt.allocations.map((allocation) => ({
          id: allocation.id,
          orderId: allocation.orderId,
          amountCents: allocation.amountCents,
          order: allocation.order,
          reversalAllocations: allocation.reversalAllocations.map((reversal) => ({ amountCents: reversal.amountCents }))
        })),
        reversals: receipt.reversals.map((reversal) => ({
          id: reversal.id,
          amountCents: reversal.amountCents,
          reason: reversal.reason,
          createdAt: reversal.createdAt.toISOString(),
          createdBy: reversal.createdBy
        }))
      })),
      semantics: {
        dateBasis: "RECEIVED_AT",
        includedOrderKinds: ["COMPLETED", "WARRANTIED"],
        amountTypes: {
          collected: "RECEIPT_AMOUNT",
          allocated: "ORDER_PAYMENT",
          reversed: "REVERSAL_AMOUNT"
        },
        allocationType: "ORDER_PAYMENT"
      },
      generatedAt: new Date().toISOString()
    };
  }

  getReceipt(user: AuthenticatedSettlementUser, id: string) {
    return this.implementation.getReceipt(user, id);
  }
}

import { ForbiddenException, Injectable } from "@nestjs/common";
import { FinanceQueryService } from "../finance-query.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessContext, type AccessSubject } from "../../permissions/domain/access-context";
import type { ListFinanceApplicationsDto } from "../dto/finance.dto";
import { ListInvoicesDto } from "../../invoices/dto/invoice.dto";
import { ListRebatesDto } from "../../rebates/dto/rebate.dto";
import { ListCommissionRulesDto } from "../../commissions/dto/commissions.dto";
import { buildInvoiceListScope } from "../../invoices/invoices.service";
import { buildRebateListScope } from "../../rebates/rebates.service";

export type FinancialDocumentKind = "expense" | "reimbursement";
type FinanceActor = { id: string; username?: string };
type FinanceListQuery = ListFinanceApplicationsDto;

export type FinancialDocumentQueryInput = {
  kind: FinancialDocumentKind;
  id: string;
};

export type FinancialTimelineEvent = {
  id: string;
  type: "DOCUMENT" | "APPROVAL" | "ATTACHMENT" | "CASH_FACT";
  occurredAt: Date | string;
  status?: string;
  actorId?: string | null;
  note?: string | null;
};

/** Stable read-only boundary for finance documents and cash facts. */
@Injectable()
export class FinancialDocumentQuery {
  constructor(
    private readonly implementation: FinanceQueryService,
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  private canAccess(actor: AccessSubject, capability: string, action: string, storeId: string) {
    return this.accessContext.can(actor, capability, action, { storeId });
  }

  listExpenses(user: FinanceActor, query: FinanceListQuery) { return this.implementation.listExpenses(user, query); }
  listReimbursements(user: FinanceActor, query: FinanceListQuery) { return this.implementation.listReimbursements(user, query); }
  getOverview(user: FinanceActor, storeId: string) { return this.implementation.getOverview(user, storeId); }
  listCashFacts(user: FinanceActor, query: FinanceListQuery) { return this.implementation.listPaymentRecords(user, query); }

  async listInvoices(user: FinanceActor, query: ListInvoicesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canAccess(actor, "store", "read", query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.invoice.findMany({
      where: buildInvoiceListScope(
        query.storeId,
        (await this.isSalesActor(actor, query.storeId)) ? actor.userId : undefined
      ),
      orderBy: { createdAt: "desc" },
      include: {
        logs: true,
        order: {
          select: {
            orderNo: true,
            status: true,
            amount: { select: { paidAmountCents: true, outstandingCents: true } },
            customer: { select: { name: true, companyName: true, contactPerson: true } },
            vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
          }
        },
        allocations: {
          orderBy: { createdAt: "asc" },
          include: {
            order: {
              select: {
                orderNo: true,
                status: true,
                amount: { select: { paidAmountCents: true, outstandingCents: true } },
                customer: { select: { name: true, companyName: true, contactPerson: true } },
                vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
              }
            }
          }
        }
      }
    });
  }

  async listRebates(user: FinanceActor, query: ListRebatesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canAccess(actor, "store", "read", query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.customerRebate.findMany({
      where: buildRebateListScope(
        query.storeId,
        (await this.isSalesActor(actor, query.storeId)) ? actor.userId : undefined
      ),
      orderBy: { createdAt: "desc" },
      include: {
        logs: true,
        order: {
          select: {
            orderNo: true,
            customer: { select: { name: true, companyName: true, contactPerson: true } },
            vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
          }
        }
      }
    });
  }

  async listCommissionRules(user: FinanceActor, query: ListCommissionRulesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canAccess(actor, "commissions", "write", query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.salesCommissionRule.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
  }

  getDocumentView(user: FinanceActor, input: { kind: FinancialDocumentKind; id: string }) {
    return input.kind === "expense"
      ? this.implementation.getExpenseDetail(user, input.id)
      : this.implementation.getReimbursementDetail(user, input.id);
  }

  /** Stable document result with the read timestamp required by the PRD. */
  async getDocument(user: FinanceActor, input: FinancialDocumentQueryInput) {
    const document = await this.getDocumentView(user, input);
    return { ...document, generatedAt: new Date().toISOString() };
  }

  async getTimeline(user: FinanceActor, input: FinancialDocumentQueryInput) {
    const document = await this.getDocument(user, input) as {
      id: string;
      createdAt?: Date | string;
      status?: string;
      applicantId?: string | null;
      approvalRecords?: Array<{ id: string; createdAt: Date | string; action: string; operatorId: string; note?: string | null }>;
      attachments?: Array<{ id: string; createdAt: Date | string; uploadedById?: string | null }>;
      paymentRecord?: { id: string; occurredAt: Date | string; amountCents: number } | null;
      generatedAt: string;
    };
    const events: FinancialTimelineEvent[] = [];
    if (document.createdAt) {
      events.push({
        id: document.id,
        type: "DOCUMENT",
        occurredAt: document.createdAt,
        status: document.status,
        actorId: document.applicantId
      });
    }
    for (const record of document.approvalRecords ?? []) {
      events.push({ id: record.id, type: "APPROVAL", occurredAt: record.createdAt, status: record.action, actorId: record.operatorId, note: record.note });
    }
    for (const attachment of document.attachments ?? []) {
      events.push({ id: attachment.id, type: "ATTACHMENT", occurredAt: attachment.createdAt, actorId: attachment.uploadedById });
    }
    if (document.paymentRecord) {
      events.push({ id: document.paymentRecord.id, type: "CASH_FACT", occurredAt: document.paymentRecord.occurredAt, status: "POSTED" });
    }
    events.sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
    return { documentId: input.id, documentType: input.kind, events, generatedAt: document.generatedAt };
  }

  async getCashFacts(user: FinanceActor, input: FinancialDocumentQueryInput) {
    const document = await this.getDocument(user, input) as { id: string; expenseId?: string | null; paymentRecord?: unknown; reimbursements?: Array<{ paymentRecordId?: string | null }>; generatedAt: string };
    const sourceIds = input.kind === "expense"
      ? (document.reimbursements ?? []).map((item) => item.paymentRecordId).filter((id): id is string => Boolean(id))
      : document.paymentRecord && typeof document.paymentRecord === "object" && "id" in document.paymentRecord
        ? [String((document.paymentRecord as { id: string }).id)]
        : [];
    const records = sourceIds.length
      ? await this.prisma.paymentRecord.findMany({ where: { id: { in: sourceIds } }, orderBy: { occurredAt: "asc" }, include: { reversalOf: true, reversedBy: true } })
      : [];
    return { documentId: input.id, documentType: input.kind, items: records, generatedAt: document.generatedAt };
  }

  async searchDocuments(user: FinanceActor, query: FinanceListQuery) {
    const [expenses, reimbursements] = await Promise.all([
      this.implementation.listExpenses(user, query),
      this.implementation.listReimbursements(user, query)
    ]);
    const generatedAt = new Date().toISOString();
    return {
      items: [
        ...expenses.items.map((item: { id: string; applicationNo: string; status: string; amountCents: number; createdAt: Date }) => ({ documentType: "expense" as const, id: item.id, documentNo: item.applicationNo, status: item.status, amountCents: item.amountCents, createdAt: item.createdAt })),
        ...reimbursements.items.map((item: { id: string; applicationNo: string; status: string; amountCents: number; createdAt: Date }) => ({ documentType: "reimbursement" as const, id: item.id, documentNo: item.applicationNo, status: item.status, amountCents: item.amountCents, createdAt: item.createdAt }))
      ],
      generatedAt
    };
  }

  async traceSource(user: FinanceActor, input: { kind: FinancialDocumentKind; id: string }) {
    if (input.kind === "expense") {
      const document = await this.implementation.getExpenseDetail(user, input.id);
      return {
        document: { kind: input.kind, id: input.id },
        source: { kind: "expense", id: input.id },
        reimbursements: document.reimbursements.map((item: { id: string; amountCents: number; status: string; paymentRecordId: string | null }) => ({
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
      source: document.expenseId ? { kind: "expense", id: document.expenseId } : null,
      reimbursements: [],
      cashFacts: document.paymentRecord ? [document.paymentRecord] : []
    };
  }

  private async isSalesActor(actor: AccessSubject, storeId: string) {
    const scope = await this.accessContext.scope(actor, "finance.document", "read", { storeId, ownerId: actor.userId });
    return scope.ownerId === actor.userId;
  }
}

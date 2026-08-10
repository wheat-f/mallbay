/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ConflictException, ForbiddenException, forwardRef, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { FinanceApprovalStatus, PaymentDirection, PaymentRecordType, Prisma } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExpenseDto, CreateReimbursementDto, ListFinanceDto, ReviewFinanceDto } from "./dto/finance.dto";
import { ExpenseWorkflowService } from "./expense-workflow.service";
import { ReimbursementWorkflowService } from "./reimbursement-workflow.service";
import { FINANCE_CAPABILITIES } from "./domain/finance-capabilities";

export type AuthenticatedFinanceUser = UserWithStoreMember & { username?: string };

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenseWorkflow?: ExpenseWorkflowService,
    @Optional() @Inject(forwardRef(() => ReimbursementWorkflowService)) private readonly reimbursementWorkflow?: ReimbursementWorkflowService,
    @Optional() private readonly accessContext?: AccessContext
  ) {}

  private canAccess(actor: AuthenticatedFinanceUser, capability: string, action: string, storeId: string, ownerId?: string) {
    if (this.accessContext) return this.accessContext.can(actor.id, capability, action, { storeId, ownerId });
    throw new Error("FinanceService access context is not configured");
  }

  /**
   * Finance is the only public writer for cash facts. Callers pass their
   * already-open business transaction so settlement state and cash facts
   * commit or roll back together.
   */
  recordCustomerReceipt(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      accountId: string;
      amountCents: number;
      sourceId: string;
      note?: string;
      createdById: string;
      occurredAt: Date;
      idempotencyKey: string;
    }
  ) {
    return tx.paymentRecord.create({
      data: {
        storeId: input.storeId,
        accountId: input.accountId,
        type: PaymentRecordType.CUSTOMER_RECEIPT,
        direction: PaymentDirection.INCOME,
        amountCents: input.amountCents,
        sourceId: input.sourceId,
        note: input.note,
        createdById: input.createdById,
        occurredAt: input.occurredAt,
        idempotencyKey: input.idempotencyKey
      }
    });
  }

  recordCustomerReceiptReversal(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      accountId: string;
      amountCents: number;
      sourceId: string;
      note?: string;
      createdById: string;
      occurredAt?: Date;
      idempotencyKey: string;
    }
  ) {
    return tx.paymentRecord.create({
      data: {
        storeId: input.storeId,
        accountId: input.accountId,
        type: PaymentRecordType.CUSTOMER_RECEIPT_REVERSAL,
        direction: PaymentDirection.EXPENSE,
        amountCents: input.amountCents,
        sourceId: input.sourceId,
        note: input.note,
        createdById: input.createdById,
        occurredAt: input.occurredAt,
        idempotencyKey: input.idempotencyKey
      }
    });
  }

  recordRebatePayout(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      amountCents: number;
      sourceId: string;
      note?: string;
      createdById: string;
      occurredAt?: Date;
      idempotencyKey: string;
    }
  ) {
    return tx.paymentRecord.create({
      data: {
        storeId: input.storeId,
        type: PaymentRecordType.REBATE,
        direction: PaymentDirection.EXPENSE,
        amountCents: input.amountCents,
        sourceId: input.sourceId,
        note: input.note,
        createdById: input.createdById,
        occurredAt: input.occurredAt,
        idempotencyKey: input.idempotencyKey
      }
    });
  }

  recordReimbursementPayout(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      accountId: string;
      amountCents: number;
      sourceId: string;
      note?: string;
      createdById: string;
      occurredAt: Date;
      idempotencyKey: string;
    }
  ) {
    return tx.paymentRecord.create({
      data: {
        storeId: input.storeId,
        accountId: input.accountId,
        type: PaymentRecordType.REIMBURSEMENT,
        direction: PaymentDirection.EXPENSE,
        amountCents: input.amountCents,
        sourceId: input.sourceId,
        note: input.note,
        createdById: input.createdById,
        occurredAt: input.occurredAt,
        idempotencyKey: input.idempotencyKey
      }
    });
  }

  async createExpense(user: AuthenticatedFinanceUser, dto: CreateExpenseDto) {
    const actor = await this.withStoreMember(user);
    if (this.expenseWorkflow) return this.expenseWorkflow.create(actor, dto);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.application.capability, FINANCE_CAPABILITIES.application.submit, dto.storeId, actor.id)) throw new ForbiddenException("无权限");
    return this.prisma.expenseApplication.create({
      data: {
        applicationNo: `FIN-EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        storeId: dto.storeId,
        applicantId: actor.id,
        title: dto.title,
        amountCents: dto.amountCents,
        reason: dto.reason,
        status: FinanceApprovalStatus.PENDING
      }
    });
  }

  async listExpenses(user: AuthenticatedFinanceUser, query: ListFinanceDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.expenseApplication.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
  }

  async createReimbursement(user: AuthenticatedFinanceUser, dto: CreateReimbursementDto) {
    const actor = await this.withStoreMember(user);
    if (this.reimbursementWorkflow) return this.reimbursementWorkflow.create(actor, dto);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.application.capability, FINANCE_CAPABILITIES.application.submit, dto.storeId, actor.id)) throw new ForbiddenException("无权限");
    return this.prisma.reimbursementApplication.create({
      data: {
        applicationNo: `FIN-RMB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        storeId: dto.storeId,
        applicantId: actor.id,
        expenseId: dto.expenseId,
        title: dto.title,
        amountCents: dto.amountCents,
        reason: dto.reason,
        status: FinanceApprovalStatus.PENDING
      }
    });
  }

  async listReimbursements(user: AuthenticatedFinanceUser, query: ListFinanceDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.reimbursementApplication.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
  }

  async approveReimbursement(user: AuthenticatedFinanceUser, id: string, dto: ReviewFinanceDto) {
    const actor = await this.withStoreMember(user);
    if (!this.reimbursementWorkflow) {
      throw new Error("FinanceService reimbursement workflow is not configured");
    }
    if (dto.status === FinanceApprovalStatus.PAID) {
      throw new ConflictException("报销付款必须使用报销支付 workflow");
    }
    if (dto.status !== FinanceApprovalStatus.APPROVED && dto.status !== FinanceApprovalStatus.REJECTED) {
      throw new ConflictException("只支持审批通过或驳回报销申请");
    }
    return this.reimbursementWorkflow.review(actor, id, {
      decision: dto.status === FinanceApprovalStatus.APPROVED ? "APPROVE" : "REJECT",
      note: dto.note
    });
  }

  async listPaymentRecords(user: AuthenticatedFinanceUser, query: ListFinanceDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.paymentRecord.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
  }

  async getExpenseDetail(user: AuthenticatedFinanceUser, id: string) {
    const actor = await this.withStoreMember(user);
    const expense = await this.prisma.expenseApplication.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException("费用申请不存在");
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, expense.storeId, expense.applicantId) &&
      !await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, expense.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.expenseApplication.findUnique({ where: { id }, include: { applicant: true, reimbursements: true } });
  }

  private async withStoreMember(user: AuthenticatedFinanceUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

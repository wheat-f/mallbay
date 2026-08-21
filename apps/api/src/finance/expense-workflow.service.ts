import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FinanceApprovalAction, FinanceApprovalNode, FinanceApprovalStatus, FinanceApplicationType, Prisma } from "@prisma/client";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExpenseDto, ResubmitExpenseDto, ReviewExpenseDto } from "./dto/finance.dto";
import { FINANCE_CAPABILITIES } from "./domain/finance-capabilities";

type FinanceActor = { id: string; username?: string };

export function buildFinanceApplicationNo(type: "EXPENSE" | "REIMBURSEMENT", now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `FIN-${type === "EXPENSE" ? "EXP" : "RMB"}-${date}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

@Injectable()
export class ExpenseWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly accessContext: AccessContext) {}

  async create(actor: FinanceActor, dto: CreateExpenseDto) {
    if (!await this.accessContext.can({ userId: actor.id }, FINANCE_CAPABILITIES.application.capability, FINANCE_CAPABILITIES.application.submit, { storeId: dto.storeId, ownerId: actor.id })) throw new ForbiddenException("无权限");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expenseApplication.create({
        data: {
          applicationNo: buildFinanceApplicationNo("EXPENSE", now),
          storeId: dto.storeId,
          applicantId: actor.id,
          title: dto.title,
          amountCents: dto.amountCents,
          reason: dto.reason,
          status: FinanceApprovalStatus.PENDING,
          currentNode: FinanceApprovalNode.MANAGER_REVIEW,
          submittedAt: now
        }
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: dto.storeId,
          applicationType: FinanceApplicationType.EXPENSE,
          applicationId: expense.id,
          node: FinanceApprovalNode.MANAGER_REVIEW,
          action: FinanceApprovalAction.SUBMITTED,
          operatorId: actor.id
        }
      });
      return expense;
    });
  }

  async review(actor: FinanceActor, id: string, dto: ReviewExpenseDto) {
    if (dto.decision !== "APPROVE" && dto.decision !== "REJECT") throw new ConflictException("只支持通过或驳回");
    const expense = await this.prisma.expenseApplication.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException("费用申请不存在");
    if (!await this.accessContext.can({ userId: actor.id }, FINANCE_CAPABILITIES.expense.capability, FINANCE_CAPABILITIES.expense.review, { storeId: expense.storeId })) throw new ForbiddenException("无权限审批费用申请");
    if (expense.status !== FinanceApprovalStatus.PENDING) throw new ConflictException("只有待审批费用可以处理");
    const status = dto.decision === "APPROVE" ? FinanceApprovalStatus.APPROVED : FinanceApprovalStatus.REJECTED;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseApplication.update({
        where: { id },
        data: { status, currentNode: null, reviewNote: dto.note, reviewedById: actor.id, reviewedAt: new Date() }
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: expense.storeId,
          applicationType: FinanceApplicationType.EXPENSE,
          applicationId: id,
          node: FinanceApprovalNode.MANAGER_REVIEW,
          action: dto.decision === "APPROVE" ? FinanceApprovalAction.APPROVED : FinanceApprovalAction.REJECTED,
          operatorId: actor.id,
          note: dto.note
        }
      });
      return updated;
    });
  }

  async withdraw(actor: FinanceActor, id: string, note?: string) {
    const expense = await this.prisma.expenseApplication.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException("费用申请不存在");
    if (!await this.accessContext.can({ userId: actor.id }, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, { storeId: expense.storeId, ownerId: expense.applicantId })) throw new ForbiddenException("无权限");
    if (expense.status !== FinanceApprovalStatus.PENDING) throw new ConflictException("只有待审批费用可以撤回");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseApplication.update({ where: { id }, data: { status: FinanceApprovalStatus.CANCELLED, currentNode: null, reviewNote: note } });
      await tx.financeApprovalRecord.create({
        data: { storeId: expense.storeId, applicationType: FinanceApplicationType.EXPENSE, applicationId: id, node: FinanceApprovalNode.MANAGER_REVIEW, action: FinanceApprovalAction.WITHDRAWN, operatorId: actor.id, note }
      });
      return updated;
    });
  }

  async resubmit(actor: FinanceActor, id: string, dto: ResubmitExpenseDto) {
    const expense = await this.prisma.expenseApplication.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException("费用申请不存在");
    if (!await this.accessContext.can({ userId: actor.id }, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, { storeId: expense.storeId, ownerId: expense.applicantId })) throw new ForbiddenException("无权限");
    if (expense.status !== FinanceApprovalStatus.REJECTED) throw new ConflictException("只有已驳回费用可以重新提交");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseApplication.update({
        where: { id },
        data: { title: dto.title, amountCents: dto.amountCents, reason: dto.reason, status: FinanceApprovalStatus.PENDING, currentNode: FinanceApprovalNode.MANAGER_REVIEW, submittedAt: now, reviewNote: null, reviewedById: null, reviewedAt: null }
      });
      await tx.financeApprovalRecord.create({
        data: { storeId: expense.storeId, applicationType: FinanceApplicationType.EXPENSE, applicationId: id, node: FinanceApprovalNode.MANAGER_REVIEW, action: FinanceApprovalAction.RESUBMITTED, operatorId: actor.id }
      });
      return updated;
    });
  }

}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FinanceApprovalAction,
  FinanceApprovalNode,
  FinanceApprovalStatus,
  FinanceApplicationType,
  PaymentDirection,
  PaymentRecordType,
} from "@prisma/client";
import {
  PermissionPolicy,
  type UserWithStoreMember,
} from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateReimbursementDto,
  PayReimbursementDto,
  ReviewReimbursementDto,
  ResubmitReimbursementDto,
} from "./dto/finance.dto";
import { buildFinanceApplicationNo } from "./expense-workflow.service";

type FinanceActor = UserWithStoreMember & { username?: string };

@Injectable()
export class ReimbursementWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: FinanceActor, dto: CreateReimbursementDto) {
    if (!PermissionPolicy.canSubmitFinanceApplication(actor, dto.storeId))
      throw new ForbiddenException("无权限");
    if (!dto.expenseId && !dto.exceptionReason?.trim())
      throw new BadRequestException(
        "报销申请必须关联已审批费用，或填写例外原因",
      );
    if (dto.expenseId) {
      const expense = await this.prisma.expenseApplication.findUnique({
        where: { id: dto.expenseId },
        select: { storeId: true, status: true, amountCents: true },
      });
      if (
        !expense ||
        expense.storeId !== dto.storeId ||
        expense.status !== FinanceApprovalStatus.APPROVED
      )
        throw new BadRequestException("只能关联本门店已审批通过的费用申请");
      const existing = await this.prisma.reimbursementApplication.aggregate({
        where: {
          expenseId: dto.expenseId,
          status: { in: [FinanceApprovalStatus.PENDING, FinanceApprovalStatus.APPROVED, FinanceApprovalStatus.PAID] },
        },
        _sum: { amountCents: true },
      });
      const usedAmountCents = existing._sum.amountCents ?? 0;
      if (dto.amountCents + usedAmountCents > expense.amountCents)
        throw new BadRequestException("报销金额超过费用剩余额度，可报销 " + Math.max(0, expense.amountCents - usedAmountCents) + " 元");
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const reimbursement = await tx.reimbursementApplication.create({
        data: {
          applicationNo: buildFinanceApplicationNo("REIMBURSEMENT", now),
          storeId: dto.storeId,
          applicantId: actor.id,
          expenseId: dto.expenseId,
          exceptionReason: dto.exceptionReason?.trim() || null,
          title: dto.title,
          amountCents: dto.amountCents,
          reason: dto.reason,
          status: FinanceApprovalStatus.PENDING,
          currentNode: FinanceApprovalNode.FINANCE_REVIEW,
          submittedAt: now,
        },
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: dto.storeId,
          applicationType: FinanceApplicationType.REIMBURSEMENT,
          applicationId: reimbursement.id,
          node: FinanceApprovalNode.FINANCE_REVIEW,
          action: FinanceApprovalAction.SUBMITTED,
          operatorId: actor.id,
        },
      });
      return reimbursement;
    });
  }

  async review(actor: FinanceActor, id: string, dto: ReviewReimbursementDto) {
    const reimbursement = await this.prisma.reimbursementApplication.findUnique(
      { where: { id } },
    );
    if (!reimbursement) throw new NotFoundException("报销申请不存在");
    if (!PermissionPolicy.canReviewReimbursement(actor, reimbursement.storeId))
      throw new ForbiddenException("无权限审批报销申请");
    if (reimbursement.status !== FinanceApprovalStatus.PENDING)
      throw new ConflictException("只有待审批报销可以处理");
    const approved = dto.decision === "APPROVE";
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reimbursementApplication.update({
        where: { id },
        data: {
          status: approved
            ? FinanceApprovalStatus.APPROVED
            : FinanceApprovalStatus.REJECTED,
          currentNode: approved ? FinanceApprovalNode.PAYMENT : null,
          reviewNote: dto.note,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: reimbursement.storeId,
          applicationType: FinanceApplicationType.REIMBURSEMENT,
          applicationId: id,
          node: FinanceApprovalNode.FINANCE_REVIEW,
          action: approved
            ? FinanceApprovalAction.APPROVED
            : FinanceApprovalAction.REJECTED,
          operatorId: actor.id,
          note: dto.note,
        },
      });
      return updated;
    });
  }

  async withdraw(actor: FinanceActor, id: string, note?: string) {
    const reimbursement = await this.prisma.reimbursementApplication.findUnique(
      { where: { id } },
    );
    if (!reimbursement) throw new NotFoundException("报销申请不存在");
    if (
      !PermissionPolicy.canViewOwnFinanceApplication(
        actor,
        reimbursement.storeId,
        reimbursement.applicantId,
      )
    )
      throw new ForbiddenException("无权限");
    if (reimbursement.status !== FinanceApprovalStatus.PENDING)
      throw new ConflictException("只有待审批报销可以撤回");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reimbursementApplication.update({
        where: { id },
        data: {
          status: FinanceApprovalStatus.CANCELLED,
          currentNode: null,
          reviewNote: note,
        },
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: reimbursement.storeId,
          applicationType: FinanceApplicationType.REIMBURSEMENT,
          applicationId: id,
          node: FinanceApprovalNode.FINANCE_REVIEW,
          action: FinanceApprovalAction.WITHDRAWN,
          operatorId: actor.id,
          note,
        },
      });
      return updated;
    });
  }

  async resubmit(
    actor: FinanceActor,
    id: string,
    dto: ResubmitReimbursementDto,
  ) {
    const reimbursement = await this.prisma.reimbursementApplication.findUnique(
      { where: { id } },
    );
    if (!reimbursement) throw new NotFoundException("报销申请不存在");
    if (
      !PermissionPolicy.canViewOwnFinanceApplication(
        actor,
        reimbursement.storeId,
        reimbursement.applicantId,
      )
    )
      throw new ForbiddenException("无权限");
    if (reimbursement.status !== FinanceApprovalStatus.REJECTED)
      throw new ConflictException("只有已驳回报销可以重新提交");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reimbursementApplication.update({
        where: { id },
        data: {
          title: dto.title,
          amountCents: dto.amountCents,
          reason: dto.reason,
          exceptionReason:
            dto.exceptionReason?.trim() || reimbursement.exceptionReason,
          status: FinanceApprovalStatus.PENDING,
          currentNode: FinanceApprovalNode.FINANCE_REVIEW,
          submittedAt: now,
          reviewNote: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: reimbursement.storeId,
          applicationType: FinanceApplicationType.REIMBURSEMENT,
          applicationId: id,
          node: FinanceApprovalNode.FINANCE_REVIEW,
          action: FinanceApprovalAction.RESUBMITTED,
          operatorId: actor.id,
        },
      });
      return updated;
    });
  }

  async pay(actor: FinanceActor, id: string, dto: PayReimbursementDto) {
    const reimbursement = await this.prisma.reimbursementApplication.findUnique(
      { where: { id } },
    );
    if (!reimbursement) throw new NotFoundException("报销申请不存在");
    if (!PermissionPolicy.canPayReimbursement(actor, reimbursement.storeId))
      throw new ForbiddenException("无权限支付报销申请");

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime()))
      throw new BadRequestException("付款时间格式不正确");
    const account = await this.prisma.paymentAccount.findUnique({
      where: { id: dto.paymentAccountId },
      select: { id: true, storeId: true, isActive: true },
    });
    if (
      !account ||
      account.storeId !== reimbursement.storeId ||
      !account.isActive
    ) {
      throw new BadRequestException("只能使用本门店启用中的付款账户");
    }

    if (
      reimbursement.status === FinanceApprovalStatus.PAID &&
      reimbursement.paymentRecordId
    ) {
      const paymentRecord = await this.prisma.paymentRecord.findUnique({
        where: { id: reimbursement.paymentRecordId },
      });
      if (!paymentRecord)
        throw new ConflictException("报销已付款但缺少对应流水");
      return { reimbursement, paymentRecord, alreadyPaid: true };
    }
    if (reimbursement.status !== FinanceApprovalStatus.APPROVED)
      throw new ConflictException("只有已审批报销可以付款");

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.paymentRecord.findFirst({
        where: { sourceId: id, type: PaymentRecordType.REIMBURSEMENT },
      });
      if (existing) {
        const updated = await tx.reimbursementApplication.update({
          where: { id },
          data: {
            status: FinanceApprovalStatus.PAID,
            currentNode: null,
            paidAt: existing.occurredAt,
            paymentRecordId: existing.id,
            paymentAccountId: dto.paymentAccountId,
          },
        });
        return {
          reimbursement: updated,
          paymentRecord: existing,
          alreadyPaid: true,
        };
      }
      const payment = await tx.paymentRecord.create({
        data: {
          storeId: reimbursement.storeId,
          accountId: dto.paymentAccountId,
          type: PaymentRecordType.REIMBURSEMENT,
          direction: PaymentDirection.EXPENSE,
          amountCents: reimbursement.amountCents,
          sourceId: id,
          note: dto.note ?? "报销打款",
          createdById: actor.id,
          occurredAt: paidAt,
        },
      });
      const updated = await tx.reimbursementApplication.update({
        where: { id },
        data: {
          status: FinanceApprovalStatus.PAID,
          currentNode: null,
          paidAt,
          paymentRecordId: payment.id,
          paymentAccountId: dto.paymentAccountId,
        },
      });
      await tx.financeApprovalRecord.create({
        data: {
          storeId: reimbursement.storeId,
          applicationType: FinanceApplicationType.REIMBURSEMENT,
          applicationId: id,
          node: FinanceApprovalNode.PAYMENT,
          action: FinanceApprovalAction.PAID,
          operatorId: actor.id,
          note: dto.note,
        },
      });
      return {
        reimbursement: updated,
        paymentRecord: payment,
        alreadyPaid: false,
      };
    });
  }
}

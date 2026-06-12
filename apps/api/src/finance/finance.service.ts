/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinanceApprovalStatus, PaymentRecordType } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExpenseDto, CreateReimbursementDto, ListFinanceDto, ReviewFinanceDto } from "./dto/finance.dto";

export type AuthenticatedFinanceUser = UserWithStoreMember & { username?: string };

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async createExpense(user: AuthenticatedFinanceUser, dto: CreateExpenseDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canSubmitFinanceApplication(actor, dto.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.expenseApplication.create({
      data: {
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
    if (!PermissionPolicy.canManageFinance(actor, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.expenseApplication.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
  }

  async createReimbursement(user: AuthenticatedFinanceUser, dto: CreateReimbursementDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canSubmitFinanceApplication(actor, dto.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.reimbursementApplication.create({
      data: {
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
    if (!PermissionPolicy.canManageFinance(actor, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.reimbursementApplication.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
  }

  async approveReimbursement(user: AuthenticatedFinanceUser, id: string, dto: ReviewFinanceDto) {
    const actor = await this.withStoreMember(user);
    const reimbursement = await this.prisma.reimbursementApplication.findUnique({ where: { id } });
    if (!reimbursement) throw new NotFoundException("报销申请不存在");
    if (!PermissionPolicy.canManageFinance(actor, reimbursement.storeId)) throw new ForbiddenException("无权限");
    const updated = await this.prisma.reimbursementApplication.update({
      where: { id },
      data: {
        status: dto.status,
        reviewNote: dto.note,
        reviewedById: actor.id,
        reviewedAt: new Date()
      }
    });
    if (dto.status === FinanceApprovalStatus.PAID) {
      await this.prisma.paymentRecord.create({
        data: {
          storeId: reimbursement.storeId,
          type: PaymentRecordType.REIMBURSEMENT,
          amountCents: reimbursement.amountCents,
          sourceId: reimbursement.id,
          note: dto.note ?? "报销打款",
          createdById: actor.id
        }
      });
    }
    return updated;
  }

  async listPaymentRecords(user: AuthenticatedFinanceUser, query: ListFinanceDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageFinance(actor, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.paymentRecord.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" } });
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

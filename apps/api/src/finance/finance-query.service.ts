import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinanceApprovalStatus, Prisma } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { ListFinanceApplicationsDto } from "./dto/finance.dto";
import { FINANCE_CAPABILITIES } from "./domain/finance-capabilities";

type FinanceActor = UserWithStoreMember & { username?: string };
type FinanceAllowedAction =
  | "REVIEW_EXPENSE"
  | "WITHDRAW"
  | "RESUBMIT"
  | "CREATE_REIMBURSEMENT"
  | "REVIEW_REIMBURSEMENT"
  | "PAY"
  | "UPLOAD_ATTACHMENT";

@Injectable()
export class FinanceQueryService {
  constructor(private readonly prisma: PrismaService, private readonly accessContext: AccessContext) {}

  private canAccess(actor: FinanceActor, capability: string, action: string, storeId: string, ownerId?: string) {
    return this.accessContext.can(actor.id, capability, action, { storeId, ownerId });
  }

  async listExpenses(actor: FinanceActor, query: ListFinanceApplicationsDto) {
    actor = await this.withStoreMember(actor);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.ExpenseApplicationWhereInput = { storeId: query.storeId };
    if (query.scope === "mine") {
      if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId, actor.id)) {
        throw new ForbiddenException("无权限");
      }
      where.applicantId = actor.id;
    } else if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { applicationNo: { contains: query.keyword, mode: "insensitive" } },
        { title: { contains: query.keyword, mode: "insensitive" } },
        { reason: { contains: query.keyword, mode: "insensitive" } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.expenseApplication.findMany({
        where,
        include: { applicant: true, reimbursements: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.expenseApplication.count({ where })
    ]);
    return { items: await Promise.all(items.map(async (item) => ({ ...item, allowedActions: await this.expenseActions(actor, item) }))), page, pageSize, total };
  }

  async listReimbursements(actor: FinanceActor, query: ListFinanceApplicationsDto) {
    actor = await this.withStoreMember(actor);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.ReimbursementApplicationWhereInput = { storeId: query.storeId };
    if (query.scope === "mine") {
      if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId, actor.id)) {
        throw new ForbiddenException("无权限");
      }
      where.applicantId = actor.id;
    } else if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { applicationNo: { contains: query.keyword, mode: "insensitive" } },
        { title: { contains: query.keyword, mode: "insensitive" } },
        { reason: { contains: query.keyword, mode: "insensitive" } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.reimbursementApplication.findMany({
        where,
        include: { applicant: true, expense: true, paymentAccount: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.reimbursementApplication.count({ where })
    ]);
    return { items: await Promise.all(items.map(async (item) => ({ ...item, allowedActions: await this.reimbursementActions(actor, item) }))), page, pageSize, total };
  }

  async getExpenseDetail(actor: FinanceActor, id: string) {
    actor = await this.withStoreMember(actor);
    const item = await this.prisma.expenseApplication.findUnique({
      where: { id },
      include: { applicant: true, reimbursements: true }
    });
    if (!item) throw new NotFoundException("费用申请不存在");
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId, item.applicantId) &&
      !await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const [approvalRecords, attachments] = await Promise.all([
      this.prisma.financeApprovalRecord.findMany({ where: { applicationType: "EXPENSE", applicationId: id }, orderBy: { createdAt: "asc" }, include: { operator: true } }),
      this.prisma.financeAttachment.findMany({ where: { applicationType: "EXPENSE", applicationId: id }, orderBy: { createdAt: "asc" }, include: { uploadedBy: true } })
    ]);
    return { ...item, allowedActions: await this.expenseActions(actor, item), approvalRecords, attachments };
  }

  async getReimbursementDetail(actor: FinanceActor, id: string) {
    actor = await this.withStoreMember(actor);
    const item = await this.prisma.reimbursementApplication.findUnique({
      where: { id },
      include: { applicant: true, expense: true, paymentAccount: true, paymentRecord: true }
    });
    if (!item) throw new NotFoundException("报销申请不存在");
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId, item.applicantId) &&
      !await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const [approvalRecords, attachments] = await Promise.all([
      this.prisma.financeApprovalRecord.findMany({ where: { applicationType: "REIMBURSEMENT", applicationId: id }, orderBy: { createdAt: "asc" }, include: { operator: true } }),
      this.prisma.financeAttachment.findMany({ where: { applicationType: "REIMBURSEMENT", applicationId: id }, orderBy: { createdAt: "asc" }, include: { uploadedBy: true } })
    ]);
    return { ...item, allowedActions: await this.reimbursementActions(actor, item), approvalRecords, attachments };
  }

  async getOverview(actor: FinanceActor, storeId: string) {
    actor = await this.withStoreMember(actor);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, storeId)) throw new ForbiddenException("无权限");
    const [expenseCount, reimbursementCount, pendingExpenseCount, pendingReimbursementCount, paymentCount] = await Promise.all([
      this.prisma.expenseApplication.count({ where: { storeId } }),
      this.prisma.reimbursementApplication.count({ where: { storeId } }),
      this.prisma.expenseApplication.count({ where: { storeId, status: FinanceApprovalStatus.PENDING } }),
      this.prisma.reimbursementApplication.count({ where: { storeId, status: FinanceApprovalStatus.APPROVED } }),
      this.prisma.paymentRecord.count({ where: { storeId } })
    ]);
    return { expenseCount, reimbursementCount, pendingExpenseCount, pendingReimbursementCount, paymentCount };
  }

  async listPaymentRecords(actor: FinanceActor, query: ListFinanceApplicationsDto) {
    actor = await this.withStoreMember(actor);
    if (!await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, query.storeId)) throw new ForbiddenException("无权限");
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.PaymentRecordWhereInput = { storeId: query.storeId };
    if (query.direction) where.direction = query.direction;
    if (query.type) where.type = query.type;
    if (query.accountId) where.accountId = query.accountId;
    if (query.dateFrom || query.dateTo) {
      where.occurredAt = {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(query.dateTo) : undefined
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.paymentRecord.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.paymentRecord.count({ where })
    ]);
    return { items, page, pageSize, total };
  }

  private async expenseActions(actor: FinanceActor, item: { storeId: string; applicantId: string; status: FinanceApprovalStatus }): Promise<FinanceAllowedAction[]> {
    const actions: FinanceAllowedAction[] = [];
    const own = await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId, item.applicantId);
    const all = await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId);
    if (item.status === FinanceApprovalStatus.PENDING && await this.canAccess(actor, FINANCE_CAPABILITIES.expense.capability, FINANCE_CAPABILITIES.expense.review, item.storeId)) actions.push("REVIEW_EXPENSE");
    if (item.status === FinanceApprovalStatus.PENDING && own) actions.push("WITHDRAW");
    if (item.status === FinanceApprovalStatus.REJECTED && own) actions.push("RESUBMIT");
    if (item.status === FinanceApprovalStatus.APPROVED && (own || all)) actions.push("CREATE_REIMBURSEMENT");
    if (own || all) actions.push("UPLOAD_ATTACHMENT");
    return actions;
  }

  private async reimbursementActions(actor: FinanceActor, item: { storeId: string; applicantId: string; status: FinanceApprovalStatus }): Promise<FinanceAllowedAction[]> {
    const actions: FinanceAllowedAction[] = [];
    const own = await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId, item.applicantId);
    const all = await this.canAccess(actor, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.read, item.storeId);
    if (item.status === FinanceApprovalStatus.PENDING && await this.canAccess(actor, FINANCE_CAPABILITIES.reimbursement.capability, FINANCE_CAPABILITIES.reimbursement.review, item.storeId)) actions.push("REVIEW_REIMBURSEMENT");
    if (item.status === FinanceApprovalStatus.APPROVED && await this.canAccess(actor, FINANCE_CAPABILITIES.reimbursement.capability, FINANCE_CAPABILITIES.reimbursement.pay, item.storeId)) actions.push("PAY");
    if (item.status === FinanceApprovalStatus.PENDING && own) actions.push("WITHDRAW");
    if (item.status === FinanceApprovalStatus.REJECTED && own) actions.push("RESUBMIT");
    if (own || all) actions.push("UPLOAD_ATTACHMENT");
    return actions;
  }

  private async withStoreMember(actor: FinanceActor): Promise<FinanceActor> {
    // JWT 只携带用户标识；财务权限必须以数据库中的当前门店岗位为准。
    // 即使调用方意外传入了旧的 storeMember，也不能继续使用缓存角色，
    // 否则岗位调整或重新登录后仍可能被错误判定为“无权限”。
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: actor.id },
      select: { storeId: true, position: true }
    });
    return { ...actor, storeMember: member };
  }
}

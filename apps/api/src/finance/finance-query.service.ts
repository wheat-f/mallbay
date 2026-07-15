import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinanceApprovalStatus, Prisma } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ListFinanceApplicationsDto } from "./dto/finance.dto";

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
  constructor(private readonly prisma: PrismaService) {}

  async listExpenses(actor: FinanceActor, query: ListFinanceApplicationsDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.ExpenseApplicationWhereInput = { storeId: query.storeId };
    if (query.scope === "mine") {
      if (!PermissionPolicy.canViewOwnFinanceApplication(actor, query.storeId, actor.id)) {
        throw new ForbiddenException("无权限");
      }
      where.applicantId = actor.id;
    } else if (!PermissionPolicy.canViewAllFinanceApplications(actor, query.storeId)) {
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
    return { items: items.map((item) => ({ ...item, allowedActions: this.expenseActions(actor, item) })), page, pageSize, total };
  }

  async listReimbursements(actor: FinanceActor, query: ListFinanceApplicationsDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.ReimbursementApplicationWhereInput = { storeId: query.storeId };
    if (query.scope === "mine") {
      if (!PermissionPolicy.canViewOwnFinanceApplication(actor, query.storeId, actor.id)) {
        throw new ForbiddenException("无权限");
      }
      where.applicantId = actor.id;
    } else if (!PermissionPolicy.canViewAllFinanceApplications(actor, query.storeId)) {
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
    return { items: items.map((item) => ({ ...item, allowedActions: this.reimbursementActions(actor, item) })), page, pageSize, total };
  }

  async getExpenseDetail(actor: FinanceActor, id: string) {
    const item = await this.prisma.expenseApplication.findUnique({
      where: { id },
      include: { applicant: true, reimbursements: true }
    });
    if (!item) throw new NotFoundException("费用申请不存在");
    if (!PermissionPolicy.canViewOwnFinanceApplication(actor, item.storeId, item.applicantId) &&
      !PermissionPolicy.canViewAllFinanceApplications(actor, item.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const [approvalRecords, attachments] = await Promise.all([
      this.prisma.financeApprovalRecord.findMany({ where: { applicationType: "EXPENSE", applicationId: id }, orderBy: { createdAt: "asc" }, include: { operator: true } }),
      this.prisma.financeAttachment.findMany({ where: { applicationType: "EXPENSE", applicationId: id }, orderBy: { createdAt: "asc" }, include: { uploadedBy: true } })
    ]);
    return { ...item, allowedActions: this.expenseActions(actor, item), approvalRecords, attachments };
  }

  async getReimbursementDetail(actor: FinanceActor, id: string) {
    const item = await this.prisma.reimbursementApplication.findUnique({
      where: { id },
      include: { applicant: true, expense: true, paymentAccount: true, paymentRecord: true }
    });
    if (!item) throw new NotFoundException("报销申请不存在");
    if (!PermissionPolicy.canViewOwnFinanceApplication(actor, item.storeId, item.applicantId) &&
      !PermissionPolicy.canViewAllFinanceApplications(actor, item.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const [approvalRecords, attachments] = await Promise.all([
      this.prisma.financeApprovalRecord.findMany({ where: { applicationType: "REIMBURSEMENT", applicationId: id }, orderBy: { createdAt: "asc" }, include: { operator: true } }),
      this.prisma.financeAttachment.findMany({ where: { applicationType: "REIMBURSEMENT", applicationId: id }, orderBy: { createdAt: "asc" }, include: { uploadedBy: true } })
    ]);
    return { ...item, allowedActions: this.reimbursementActions(actor, item), approvalRecords, attachments };
  }

  async getOverview(actor: FinanceActor, storeId: string) {
    if (!PermissionPolicy.canViewAllFinanceApplications(actor, storeId)) throw new ForbiddenException("无权限");
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
    if (!PermissionPolicy.canViewAllFinanceApplications(actor, query.storeId)) throw new ForbiddenException("无权限");
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

  private expenseActions(actor: FinanceActor, item: { storeId: string; applicantId: string; status: FinanceApprovalStatus }): FinanceAllowedAction[] {
    const actions: FinanceAllowedAction[] = [];
    const own = PermissionPolicy.canViewOwnFinanceApplication(actor, item.storeId, item.applicantId);
    const all = PermissionPolicy.canViewAllFinanceApplications(actor, item.storeId);
    if (item.status === FinanceApprovalStatus.PENDING && PermissionPolicy.canReviewExpense(actor, item.storeId)) actions.push("REVIEW_EXPENSE");
    if (item.status === FinanceApprovalStatus.PENDING && own) actions.push("WITHDRAW");
    if (item.status === FinanceApprovalStatus.REJECTED && own) actions.push("RESUBMIT");
    if (item.status === FinanceApprovalStatus.APPROVED && (own || all)) actions.push("CREATE_REIMBURSEMENT");
    if (own || all) actions.push("UPLOAD_ATTACHMENT");
    return actions;
  }

  private reimbursementActions(actor: FinanceActor, item: { storeId: string; applicantId: string; status: FinanceApprovalStatus }): FinanceAllowedAction[] {
    const actions: FinanceAllowedAction[] = [];
    const own = PermissionPolicy.canViewOwnFinanceApplication(actor, item.storeId, item.applicantId);
    const all = PermissionPolicy.canViewAllFinanceApplications(actor, item.storeId);
    if (item.status === FinanceApprovalStatus.PENDING && PermissionPolicy.canReviewReimbursement(actor, item.storeId)) actions.push("REVIEW_REIMBURSEMENT");
    if (item.status === FinanceApprovalStatus.APPROVED && PermissionPolicy.canPayReimbursement(actor, item.storeId)) actions.push("PAY");
    if (item.status === FinanceApprovalStatus.PENDING && own) actions.push("WITHDRAW");
    if (item.status === FinanceApprovalStatus.REJECTED && own) actions.push("RESUBMIT");
    if (own || all) actions.push("UPLOAD_ATTACHMENT");
    return actions;
  }
}

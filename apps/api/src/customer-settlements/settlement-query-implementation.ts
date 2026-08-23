/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { CustomerReceiptStatus, CustomerStatementStatus, CustomerType, OrderStatus } from "@prisma/client";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import {
  ListCustomerReceiptsDto,
  ListCustomerStatementsDto,
  ListStatementCandidatesDto,
  PreviewCustomerReceiptDto
} from "./dto/customer-settlement.dto";
import {
  buildAutomaticReceiptAllocation,
  type ReceiptAllocationCandidate
} from "./domain/receipt-allocation";
import type { AuthenticatedSettlementUser } from "./settlement-execution-implementation";

const SETTLED_ORDER_STATUSES = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED];

@Injectable()
export class SettlementQueryImplementation {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  async listStatementCandidates(
    user: AuthenticatedSettlementUser,
    query: ListStatementCandidatesDto
  ) {
    const actor = { userId: user.id } satisfies AccessSubject;
    await this.assertCanViewCustomer(actor, query.storeId, query.customerId);
    return this.loadCandidateOrders(
      query.storeId,
      query.customerId,
      query.periodStart ? new Date(query.periodStart) : undefined,
      query.periodEnd ? endOfDay(new Date(query.periodEnd)) : undefined
    );
  }

  async listStatements(user: AuthenticatedSettlementUser, query: ListCustomerStatementsDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canAccess(actor, "finance", "write", query.storeId)) {
      if (!query.customerId) throw new ForbiddenException("请选择有权限查看的客户");
      await this.assertCanViewCustomer(actor, query.storeId, query.customerId);
    }
    return this.prisma.customerStatement.findMany({
      where: { storeId: query.storeId, customerId: query.customerId, status: query.status },
      include: statementInclude,
      orderBy: { createdAt: "desc" }
    });
  }

  async getStatement(user: AuthenticatedSettlementUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const statement = await this.prisma.customerStatement.findUnique({
      where: { id },
      include: statementInclude
    });
    if (!statement) throw new NotFoundException("对账单不存在");
    await this.assertCanViewCustomer(actor, statement.storeId, statement.customerId);
    return statement;
  }

  async previewReceiptAllocation(user: AuthenticatedSettlementUser, dto: PreviewCustomerReceiptDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    await this.assertCanManageReceipts(actor, dto.storeId);
    const customer = await this.requireCustomer(dto.storeId, dto.customerId);
    this.assertCompanyCustomer(customer.customerType);
    const candidates = await this.loadReceiptCandidates(dto.storeId, dto.customerId, dto.orderIds);
    const allocations = buildAutomaticReceiptAllocation(dto.amountCents, candidates);
    return {
      amountCents: dto.amountCents,
      availableCents: candidates.reduce((sum, order) => sum + order.outstandingCents, 0),
      allocations: this.describeAllocations(allocations, candidates)
    };
  }

  async listReceipts(user: AuthenticatedSettlementUser, query: ListCustomerReceiptsDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    await this.assertCanManageReceipts(actor, query.storeId);
    const receipts = await this.prisma.customerReceipt.findMany({
      where: { storeId: query.storeId, customerId: query.customerId, status: query.status },
      include: receiptInclude,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }]
    });
    return receipts.map(withReversedAmount);
  }

  async getReceipt(user: AuthenticatedSettlementUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const receipt = await this.prisma.customerReceipt.findUnique({
      where: { id },
      include: receiptInclude
    });
    if (!receipt) throw new NotFoundException("企业收款不存在");
    await this.assertCanManageReceipts(actor, receipt.storeId);
    return withReversedAmount(receipt);
  }

  private async loadCandidateOrders(storeId: string, customerId: string, periodStart?: Date, periodEnd?: Date) {
    return this.prisma.order.findMany({
      where: {
        storeId,
        customerId,
        status: { in: SETTLED_ORDER_STATUSES },
        createdAt: periodStart || periodEnd ? { gte: periodStart, lte: periodEnd } : undefined,
        amount: { isNot: null }
      },
      select: {
        id: true,
        orderNo: true,
        status: true,
        createdAt: true,
        appointmentDate: true,
        vehicle: { select: { id: true, carPlate: true, carModel: true, department: true } },
        contactSnapshot: { select: { contactName: true, role: true, department: true } },
        amount: { select: { totalAmountCents: true, paidAmountCents: true, outstandingCents: true } },
        constructionRecord: { select: { completedAt: true } }
      },
      orderBy: [{ createdAt: "asc" }, { orderNo: "asc" }]
    });
  }

  private async loadReceiptCandidates(storeId: string, customerId: string, orderIds?: string[]): Promise<ReceiptAllocationCandidate[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        customerId,
        id: orderIds?.length ? { in: orderIds } : undefined,
        status: { in: SETTLED_ORDER_STATUSES },
        amount: { is: { outstandingCents: { gt: 0 } } }
      },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        amount: { select: { outstandingCents: true } },
        constructionRecord: { select: { completedAt: true } }
      }
    });
    if (orderIds?.length && orders.length !== new Set(orderIds).size) {
      throw new BadRequestException("所选订单必须属于当前企业、门店、已完工且仍有待收金额");
    }
    return orders.map((order) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      outstandingCents: order.amount?.outstandingCents ?? 0,
      completedAt: order.constructionRecord?.completedAt ?? null,
      createdAt: order.createdAt
    }));
  }

  private describeAllocations(
    allocations: Array<{ orderId: string; amountCents: number }>,
    candidates: ReceiptAllocationCandidate[]
  ) {
    const byId = new Map(candidates.map((candidate) => [candidate.orderId, candidate]));
    return allocations.map((allocation) => ({ ...allocation, orderNo: byId.get(allocation.orderId)?.orderNo ?? "" }));
  }

  private async assertCanViewCustomer(actor: AccessSubject, storeId: string, customerId: string) {
    const customer = await this.requireCustomer(storeId, customerId);
    if (!await this.canAccess(actor, "customers", "read", storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }
    return customer;
  }

  private async requireCustomer(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true, storeId: true, ownerUserId: true, customerType: true, name: true }
    });
    if (!customer) throw new NotFoundException("客户不存在或不属于当前门店");
    return customer;
  }

  private assertCompanyCustomer(type: CustomerType) {
    if (type !== CustomerType.COMPANY) throw new BadRequestException("企业统一结算仅适用于企业客户");
  }

  private async assertCanManageReceipts(actor: AccessSubject, storeId: string) {
    if (!await this.canAccess(actor, "finance", "write", storeId)) {
      throw new ForbiddenException("仅店长或财务可以管理企业统一收款");
    }
  }

  private canAccess(actor: AccessSubject, capability: string, action: string, storeId: string, ownerId?: string) {
    return this.accessContext.can(actor, capability, action, { storeId, ownerId });
  }
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function withReversedAmount<T extends { amountCents: number; reversals: Array<{ amountCents: number }> }>(receipt: T) {
  const reversedAmountCents = receipt.reversals.reduce((sum, reversal) => sum + reversal.amountCents, 0);
  return { ...receipt, reversedAmountCents, reversibleAmountCents: receipt.amountCents - reversedAmountCents };
}

const statementInclude = {
  customer: { select: { id: true, name: true, companyName: true, customerType: true } },
  confirmedBy: { select: { id: true, username: true, nickname: true } },
  items: {
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          status: true,
          createdAt: true,
          vehicle: { select: { id: true, carPlate: true, brand: true, model: true, department: true } },
          contactSnapshot: { select: { contactName: true, role: true, department: true } }
        }
      }
    },
    orderBy: { createdAt: "asc" as const }
  }
} as const;

const receiptInclude = {
  customer: { select: { id: true, name: true, companyName: true } },
  account: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, username: true, nickname: true } },
  postedBy: { select: { id: true, username: true, nickname: true } },
  allocations: {
    include: {
      order: { select: { id: true, orderNo: true, vehicle: { select: { carPlate: true, carModel: true } } } },
      reversalAllocations: true
    },
    orderBy: { createdAt: "asc" as const }
  },
  reversals: {
    include: { createdBy: { select: { id: true, username: true, nickname: true } }, allocations: true },
    orderBy: { createdAt: "desc" as const }
  }
} as const;


/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  CustomerReceiptStatus,
  CustomerStatementStatus,
  CustomerType,
  OrderStatus,
  PaymentDirection,
  PaymentRecordType,
  PaymentType,
  StorePosition
} from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { persistAuditEvent } from "../observability/persist-audit-event";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateCustomerReceiptDto,
  CreateCustomerStatementDto,
  CustomerReceiptAllocationDto,
  ListCustomerReceiptsDto,
  ListCustomerStatementsDto,
  ListStatementCandidatesDto,
  PreviewCustomerReceiptDto,
  ReverseCustomerReceiptDto,
  StatementActionDto
} from "./dto/customer-settlement.dto";
import {
  buildAutomaticReceiptAllocation,
  type ReceiptAllocationCandidate
} from "./domain/receipt-allocation";

export type AuthenticatedSettlementUser = UserWithStoreMember & {
  username?: string;
};

const SETTLED_ORDER_STATUSES = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED];

@Injectable()
export class CustomerSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async listStatementCandidates(
    user: AuthenticatedSettlementUser,
    query: ListStatementCandidatesDto
  ) {
    const actor = await this.withStoreMember(user);
    await this.assertCanViewCustomer(actor, query.storeId, query.customerId);
    return this.loadCandidateOrders(
      query.storeId,
      query.customerId,
      query.periodStart ? new Date(query.periodStart) : undefined,
      query.periodEnd ? endOfDay(new Date(query.periodEnd)) : undefined
    );
  }

  async listStatements(
    user: AuthenticatedSettlementUser,
    query: ListCustomerStatementsDto
  ) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageFinance(actor, query.storeId)) {
      if (!query.customerId) throw new ForbiddenException("请选择有权限查看的客户");
      await this.assertCanViewCustomer(actor, query.storeId, query.customerId);
    }

    return this.prisma.customerStatement.findMany({
      where: {
        storeId: query.storeId,
        customerId: query.customerId,
        status: query.status
      },
      include: statementInclude,
      orderBy: { createdAt: "desc" }
    });
  }

  async getStatement(user: AuthenticatedSettlementUser, id: string) {
    const actor = await this.withStoreMember(user);
    const statement = await this.prisma.customerStatement.findUnique({
      where: { id },
      include: statementInclude
    });
    if (!statement) throw new NotFoundException("对账单不存在");
    await this.assertCanViewCustomer(actor, statement.storeId, statement.customerId);
    return statement;
  }

  async createStatement(
    user: AuthenticatedSettlementUser,
    dto: CreateCustomerStatementDto
  ) {
    const actor = await this.withStoreMember(user);
    const customer = await this.assertCanViewCustomer(actor, dto.storeId, dto.customerId);
    this.assertCompanyCustomer(customer.customerType);

    const periodStart = new Date(dto.periodStart);
    const periodEnd = endOfDay(new Date(dto.periodEnd));
    if (periodStart > periodEnd) throw new BadRequestException("对账开始日期不能晚于结束日期");

    const orders = await this.loadCandidateOrders(dto.storeId, dto.customerId);
    const requestedIds = new Set(dto.orderIds);
    const selected = orders.filter((order) => requestedIds.has(order.id));
    if (selected.length !== requestedIds.size) {
      throw new BadRequestException("所选订单必须属于当前企业、门店且已完工");
    }
    for (const order of selected) {
      if (order.createdAt < periodStart || order.createdAt > periodEnd) {
        throw new BadRequestException(`订单 ${order.orderNo} 不在对账期间内`);
      }
    }

    const receivableCents = selected.reduce(
      (sum, order) => sum + (order.amount?.totalAmountCents ?? 0),
      0
    );
    const receivedCents = selected.reduce(
      (sum, order) => sum + (order.amount?.paidAmountCents ?? 0),
      0
    );
    const outstandingCents = selected.reduce(
      (sum, order) => sum + (order.amount?.outstandingCents ?? 0),
      0
    );

    const statement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerStatement.create({
        data: {
          storeId: dto.storeId,
          customerId: dto.customerId,
          statementNo: createBusinessNo("STM"),
          periodStart,
          periodEnd,
          receivableCents,
          receivedCents,
          outstandingCents,
          items: {
            create: selected.map((order) => ({
              orderId: order.id,
              orderAmountCents: order.amount?.totalAmountCents ?? 0,
              paidAmountCents: order.amount?.paidAmountCents ?? 0,
              outstandingCents: order.amount?.outstandingCents ?? 0
            }))
          }
        },
        include: statementInclude
      });
      await persistAuditEvent(tx, {
        action: "CUSTOMER_STATEMENT_CREATED",
        actorId: actor.id,
        targetType: "customerStatement",
        targetId: created.id,
        metadata: {
          storeId: dto.storeId,
          customerId: dto.customerId,
          orderIds: dto.orderIds,
          receivableCents,
          outstandingCents
        }
      });
      return created;
    });
    return statement;
  }

  async confirmStatement(
    user: AuthenticatedSettlementUser,
    id: string
  ) {
    const actor = await this.withStoreMember(user);
    const statement = await this.prisma.customerStatement.findUnique({ where: { id } });
    if (!statement) throw new NotFoundException("对账单不存在");
    await this.assertCanViewCustomer(actor, statement.storeId, statement.customerId);
    if (statement.status !== CustomerStatementStatus.DRAFT) {
      throw new BadRequestException("只有草稿对账单可以确认");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerStatement.update({
        where: { id },
        data: {
          status: CustomerStatementStatus.CONFIRMED,
          confirmedById: actor.id,
          confirmedAt: new Date()
        },
        include: statementInclude
      });
      await persistAuditEvent(tx, {
        action: "CUSTOMER_STATEMENT_CONFIRMED",
        actorId: actor.id,
        targetType: "customerStatement",
        targetId: id,
        metadata: { storeId: statement.storeId, customerId: statement.customerId }
      });
      return updated;
    });
  }

  async voidStatement(
    user: AuthenticatedSettlementUser,
    id: string,
    dto: StatementActionDto
  ) {
    const actor = await this.withStoreMember(user);
    const statement = await this.prisma.customerStatement.findUnique({ where: { id } });
    if (!statement) throw new NotFoundException("对账单不存在");
    if (!PermissionPolicy.canManageFinance(actor, statement.storeId)) {
      throw new ForbiddenException("仅店长或财务可以作废对账单");
    }
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException("作废对账单必须填写原因");
    if (statement.status === CustomerStatementStatus.VOIDED) {
      throw new BadRequestException("对账单已作废");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerStatement.update({
        where: { id },
        data: { status: CustomerStatementStatus.VOIDED, voidReason: reason },
        include: statementInclude
      });
      await persistAuditEvent(tx, {
        action: "CUSTOMER_STATEMENT_VOIDED",
        actorId: actor.id,
        targetType: "customerStatement",
        targetId: id,
        metadata: { storeId: statement.storeId, reason }
      });
      return updated;
    });
  }

  async previewReceiptAllocation(
    user: AuthenticatedSettlementUser,
    dto: PreviewCustomerReceiptDto
  ) {
    const actor = await this.withStoreMember(user);
    this.assertCanManageReceipts(actor, dto.storeId);
    const customer = await this.requireCustomer(dto.storeId, dto.customerId);
    this.assertCompanyCustomer(customer.customerType);

    const candidates = await this.loadReceiptCandidates(
      dto.storeId,
      dto.customerId,
      dto.orderIds
    );
    const allocations = buildAutomaticReceiptAllocation(dto.amountCents, candidates);
    return {
      amountCents: dto.amountCents,
      availableCents: candidates.reduce((sum, order) => sum + order.outstandingCents, 0),
      allocations: this.describeAllocations(allocations, candidates)
    };
  }

  async listReceipts(
    user: AuthenticatedSettlementUser,
    query: ListCustomerReceiptsDto
  ) {
    const actor = await this.withStoreMember(user);
    this.assertCanManageReceipts(actor, query.storeId);
    const receipts = await this.prisma.customerReceipt.findMany({
      where: {
        storeId: query.storeId,
        customerId: query.customerId,
        status: query.status
      },
      include: receiptInclude,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }]
    });
    return receipts.map(withReversedAmount);
  }

  async getReceipt(user: AuthenticatedSettlementUser, id: string) {
    const actor = await this.withStoreMember(user);
    const receipt = await this.prisma.customerReceipt.findUnique({
      where: { id },
      include: receiptInclude
    });
    if (!receipt) throw new NotFoundException("企业收款不存在");
    this.assertCanManageReceipts(actor, receipt.storeId);
    return withReversedAmount(receipt);
  }

  async createReceipt(
    user: AuthenticatedSettlementUser,
    dto: CreateCustomerReceiptDto
  ) {
    const actor = await this.withStoreMember(user);
    this.assertCanManageReceipts(actor, dto.storeId);
    const customer = await this.requireCustomer(dto.storeId, dto.customerId);
    this.assertCompanyCustomer(customer.customerType);

    const account = await this.prisma.paymentAccount.findFirst({
      where: { id: dto.accountId, storeId: dto.storeId, isActive: true }
    });
    if (!account) throw new BadRequestException("收款账户不存在、已停用或不属于当前门店");

    const requestedOrderIds = dto.allocations?.map((item) => item.orderId) ?? dto.orderIds;
    const candidates = await this.loadReceiptCandidates(
      dto.storeId,
      dto.customerId,
      requestedOrderIds
    );
    const allocations = dto.allocations
      ? this.validateManualAllocations(dto.amountCents, dto.allocations, candidates)
      : buildAutomaticReceiptAllocation(dto.amountCents, candidates);
    const candidateById = new Map(candidates.map((candidate) => [candidate.orderId, candidate]));

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.customerReceipt.create({
        data: {
          storeId: dto.storeId,
          customerId: dto.customerId,
          accountId: dto.accountId,
          receiptNo: createBusinessNo("RCT"),
          amountCents: dto.amountCents,
          receivedAt: new Date(dto.receivedAt),
          payerName: dto.payerName?.trim() || undefined,
          bankSerialNo: dto.bankSerialNo?.trim() || undefined,
          note: dto.note?.trim() || undefined,
          status: CustomerReceiptStatus.POSTED,
          createdById: actor.id,
          postedById: actor.id,
          postedAt: new Date()
        }
      });

      for (const allocation of allocations) {
        const candidate = candidateById.get(allocation.orderId)!;
        await tx.orderPayment.create({
          data: {
            orderId: allocation.orderId,
            accountId: dto.accountId,
            paymentType: allocation.amountCents === candidate.outstandingCents
              ? PaymentType.FULL
              : PaymentType.BALANCE,
            amountCents: allocation.amountCents,
            paidAt: new Date(dto.receivedAt),
            createdById: actor.id,
            customerReceiptId: receipt.id
          }
        });
        await tx.orderAmount.update({
          where: { orderId: allocation.orderId },
          data: {
            paidAmountCents: { increment: allocation.amountCents },
            outstandingCents: { decrement: allocation.amountCents }
          }
        });
      }

      await tx.paymentRecord.create({
        data: {
          storeId: dto.storeId,
          accountId: dto.accountId,
          type: PaymentRecordType.CUSTOMER_RECEIPT,
          direction: PaymentDirection.INCOME,
          amountCents: dto.amountCents,
          sourceId: receipt.id,
          note: dto.note?.trim() || `企业统一收款 ${receipt.receiptNo}`,
          createdById: actor.id,
          occurredAt: new Date(dto.receivedAt)
        }
      });
      await persistAuditEvent(tx, {
        action: "CUSTOMER_RECEIPT_POSTED",
        actorId: actor.id,
        targetType: "customerReceipt",
        targetId: receipt.id,
        metadata: {
          storeId: dto.storeId,
          customerId: dto.customerId,
          amountCents: dto.amountCents,
          allocations
        }
      });
      return tx.customerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: receiptInclude
      });
    });
  }

  async reverseReceipt(
    user: AuthenticatedSettlementUser,
    id: string,
    dto: ReverseCustomerReceiptDto
  ) {
    const actor = await this.withStoreMember(user);
    const receipt = await this.prisma.customerReceipt.findUnique({
      where: { id },
      include: receiptInclude
    });
    if (!receipt) throw new NotFoundException("企业收款不存在");
    this.assertCanReverseReceipt(actor, receipt.storeId);
    if (receipt.status === CustomerReceiptStatus.DRAFT) {
      throw new BadRequestException("草稿收款尚未入账，不能红冲");
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException("红冲必须填写原因");

    const priorReversedCents = receipt.reversals.reduce(
      (sum, reversal) => sum + reversal.amountCents,
      0
    );
    const remainingReceiptCents = receipt.amountCents - priorReversedCents;
    if (dto.amountCents > remainingReceiptCents) {
      throw new BadRequestException("红冲金额不能超过原收款剩余可红冲金额");
    }

    const availableByOrder = receipt.allocations.map((payment) => ({
      orderId: payment.orderId,
      orderPaymentId: payment.id,
      amountCents: payment.amountCents - payment.reversalAllocations.reduce(
        (sum, allocation) => sum + allocation.amountCents,
        0
      ),
      createdAt: payment.createdAt
    }));
    const allocations = dto.allocations
      ? this.validateReversalAllocations(dto.amountCents, dto.allocations, availableByOrder)
      : buildAutomaticReversalAllocation(dto.amountCents, availableByOrder);

    const fullyReversed = priorReversedCents + dto.amountCents === receipt.amountCents;
    return this.prisma.$transaction(async (tx) => {
      const reversal = await tx.customerReceiptReversal.create({
        data: {
          receiptId: receipt.id,
          amountCents: dto.amountCents,
          reason,
          createdById: actor.id,
          allocations: {
            create: allocations.map((allocation) => ({
              orderPaymentId: allocation.orderPaymentId,
              orderId: allocation.orderId,
              amountCents: allocation.amountCents
            }))
          }
        }
      });

      for (const allocation of allocations) {
        await tx.orderAmount.update({
          where: { orderId: allocation.orderId },
          data: {
            paidAmountCents: { decrement: allocation.amountCents },
            outstandingCents: { increment: allocation.amountCents }
          }
        });
      }

      await tx.paymentRecord.create({
        data: {
          storeId: receipt.storeId,
          accountId: receipt.accountId,
          type: PaymentRecordType.CUSTOMER_RECEIPT_REVERSAL,
          direction: PaymentDirection.EXPENSE,
          amountCents: dto.amountCents,
          sourceId: reversal.id,
          note: `企业收款红冲：${reason}`,
          createdById: actor.id
        }
      });

      if (fullyReversed) {
        await tx.customerReceipt.update({
          where: { id: receipt.id },
          data: {
            status: CustomerReceiptStatus.REVERSED,
            reversedById: actor.id,
            reversedAt: new Date(),
            reversedReason: reason
          }
        });
      }

      await persistAuditEvent(tx, {
        action: fullyReversed
          ? "CUSTOMER_RECEIPT_FULLY_REVERSED"
          : "CUSTOMER_RECEIPT_PARTIALLY_REVERSED",
        actorId: actor.id,
        targetType: "customerReceipt",
        targetId: receipt.id,
        metadata: {
          storeId: receipt.storeId,
          reversalId: reversal.id,
          amountCents: dto.amountCents,
          reason,
          allocations
        }
      });

      const updated = await tx.customerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: receiptInclude
      });
      return withReversedAmount(updated);
    });
  }

  private async loadCandidateOrders(
    storeId: string,
    customerId: string,
    periodStart?: Date,
    periodEnd?: Date
  ) {
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
        vehicle: {
          select: { id: true, carPlate: true, carModel: true, department: true }
        },
        contactSnapshot: {
          select: { contactName: true, role: true, department: true }
        },
        amount: {
          select: {
            totalAmountCents: true,
            paidAmountCents: true,
            outstandingCents: true
          }
        },
        constructionRecord: { select: { completedAt: true } }
      },
      orderBy: [{ createdAt: "asc" }, { orderNo: "asc" }]
    });
  }

  private async loadReceiptCandidates(
    storeId: string,
    customerId: string,
    orderIds?: string[]
  ): Promise<ReceiptAllocationCandidate[]> {
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

  private validateManualAllocations(
    amountCents: number,
    allocations: CustomerReceiptAllocationDto[],
    candidates: ReceiptAllocationCandidate[]
  ) {
    const candidateById = new Map(candidates.map((candidate) => [candidate.orderId, candidate]));
    const seen = new Set<string>();
    let allocatedCents = 0;
    for (const allocation of allocations) {
      if (seen.has(allocation.orderId)) throw new BadRequestException("同一订单不能重复分摊");
      seen.add(allocation.orderId);
      const candidate = candidateById.get(allocation.orderId);
      if (!candidate) throw new BadRequestException("分摊订单不属于当前企业或已无待收金额");
      if (allocation.amountCents > candidate.outstandingCents) {
        throw new BadRequestException(`订单 ${candidate.orderNo} 的分摊金额超过待收金额`);
      }
      allocatedCents += allocation.amountCents;
    }
    if (allocatedCents !== amountCents) throw new BadRequestException("分摊合计必须等于收款金额");
    return allocations;
  }

  private validateReversalAllocations(
    amountCents: number,
    allocations: CustomerReceiptAllocationDto[],
    available: Array<{
      orderId: string;
      orderPaymentId: string;
      amountCents: number;
      createdAt: Date;
    }>
  ) {
    const availableByOrder = new Map(available.map((item) => [item.orderId, item]));
    const seen = new Set<string>();
    let allocatedCents = 0;
    const result = allocations.map((allocation) => {
      if (seen.has(allocation.orderId)) throw new BadRequestException("同一订单不能重复红冲");
      seen.add(allocation.orderId);
      const source = availableByOrder.get(allocation.orderId);
      if (!source || allocation.amountCents > source.amountCents) {
        throw new BadRequestException("订单红冲金额超过原收款剩余分摊金额");
      }
      allocatedCents += allocation.amountCents;
      return { ...allocation, orderPaymentId: source.orderPaymentId };
    });
    if (allocatedCents !== amountCents) throw new BadRequestException("红冲分摊合计必须等于红冲金额");
    return result;
  }

  private describeAllocations(
    allocations: Array<{ orderId: string; amountCents: number }>,
    candidates: ReceiptAllocationCandidate[]
  ) {
    const byId = new Map(candidates.map((candidate) => [candidate.orderId, candidate]));
    return allocations.map((allocation) => ({
      ...allocation,
      orderNo: byId.get(allocation.orderId)?.orderNo ?? ""
    }));
  }

  private async assertCanViewCustomer(
    actor: UserWithStoreMember,
    storeId: string,
    customerId: string
  ) {
    const customer = await this.requireCustomer(storeId, customerId);
    if (!PermissionPolicy.canViewCustomer(actor, storeId, customer.ownerUserId)) {
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
    if (type !== CustomerType.COMPANY) {
      throw new BadRequestException("企业统一结算仅适用于企业客户");
    }
  }

  private assertCanManageReceipts(actor: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.canManageFinance(actor, storeId)) {
      throw new ForbiddenException("仅店长或财务可以管理企业统一收款");
    }
  }

  private assertCanReverseReceipt(actor: UserWithStoreMember, storeId: string) {
    const isFinance = PermissionPolicy.isStoreMember(actor, storeId) &&
      actor.storeMember?.position === StorePosition.FINANCE;
    if (!actor.isAuditor && !isFinance) {
      throw new ForbiddenException("仅财务可以执行收款红冲");
    }
  }

  private async withStoreMember(
    user: AuthenticatedSettlementUser
  ): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const storeMember = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember };
  }
}

function buildAutomaticReversalAllocation(
  amountCents: number,
  available: Array<{
    orderId: string;
    orderPaymentId: string;
    amountCents: number;
    createdAt: Date;
  }>
) {
  let remainingCents = amountCents;
  const allocations: Array<{
    orderId: string;
    orderPaymentId: string;
    amountCents: number;
  }> = [];
  const ordered = [...available].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  for (const source of ordered) {
    if (remainingCents <= 0) break;
    if (source.amountCents <= 0) continue;
    const reversedCents = Math.min(source.amountCents, remainingCents);
    allocations.push({
      orderId: source.orderId,
      orderPaymentId: source.orderPaymentId,
      amountCents: reversedCents
    });
    remainingCents -= reversedCents;
  }
  if (remainingCents > 0) throw new BadRequestException("红冲金额超过可红冲余额");
  return allocations;
}

function createBusinessNo(prefix: string) {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function withReversedAmount<T extends {
  amountCents: number;
  reversals: Array<{ amountCents: number }>;
}>(receipt: T) {
  const reversedAmountCents = receipt.reversals.reduce(
    (sum, reversal) => sum + reversal.amountCents,
    0
  );
  return {
    ...receipt,
    reversedAmountCents,
    reversibleAmountCents: receipt.amountCents - reversedAmountCents
  };
}

const statementInclude = {
  customer: {
    select: { id: true, name: true, companyName: true, customerType: true }
  },
  confirmedBy: {
    select: { id: true, username: true, nickname: true }
  },
  items: {
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          status: true,
          createdAt: true,
          vehicle: {
            select: { id: true, carPlate: true, brand: true, model: true, department: true }
          },
          contactSnapshot: {
            select: { contactName: true, role: true, department: true }
          }
        }
      }
    },
    orderBy: { createdAt: "asc" as const }
  }
} as const;

const receiptInclude = {
  customer: {
    select: { id: true, name: true, companyName: true }
  },
  account: {
    select: { id: true, name: true, type: true }
  },
  createdBy: {
    select: { id: true, username: true, nickname: true }
  },
  postedBy: {
    select: { id: true, username: true, nickname: true }
  },
  allocations: {
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          vehicle: { select: { carPlate: true, carModel: true } }
        }
      },
      reversalAllocations: true
    },
    orderBy: { createdAt: "asc" as const }
  },
  reversals: {
    include: {
      createdBy: { select: { id: true, username: true, nickname: true } },
      allocations: true
    },
    orderBy: { createdAt: "desc" as const }
  }
} as const;

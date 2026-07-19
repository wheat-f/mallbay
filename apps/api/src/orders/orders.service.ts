/* eslint-disable @typescript-eslint/consistent-type-imports */
import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ConstructionTaskStatus,
  OrderAmendmentStatus,
  OrderStatus,
  PaymentDirection,
  PaymentRecordType,
  Prisma,
  ProductStatus,
  StorePosition
} from "@prisma/client";
import { normalizePagination } from "../common/pagination";
import {
  PermissionPolicy,
  type UserWithStoreMember
} from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { multiplyMoneyCents } from "../pricing/domain/money";
import { AuditLogService, type AuditEvent } from "../observability/audit-log.service";
import { OrderPolicy } from "./domain/order-policy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateOrderPaymentDto } from "./dto/create-order-payment.dto";
import { CreatePaymentAccountDto } from "./dto/create-payment-account.dto";
import { ExportOrderDetailsDto, ListOrdersDto } from "./dto/list-orders.dto";
import { ReturnOrderDto } from "./dto/return-order.dto";
import { CreateOrderAmendmentRequestDto, ReviewOrderAmendmentRequestDto } from "./dto/order-amendment.dto";
import { UpdateOrderCommercialsDto } from "./dto/update-order-commercials.dto";
import { UpdatePaymentAccountDto } from "./dto/update-payment-account.dto";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";

const CUSTOMER_SERVICE = "CUSTOMER_SERVICE" as StorePosition;

const INTERNAL_ORDER_AMOUNT_FIELDS = [
  "salesCommissionCents",
  "materialCostCents",
  "profitCents",
  "pricingOutputSnapshot",
  "estimatedMaterialCostCents",
  "estimatedConstructionCostCents",
  "estimatedTotalCostCents",
  "costCompleteness",
  "temporaryCostCents",
  "temporaryCostReason"
] as const;

/** Sales may see customer-facing charge values, never internal cost/profit snapshots. */
export function redactOrderAmount<T extends object>(amount: T): Omit<T, (typeof INTERNAL_ORDER_AMOUNT_FIELDS)[number]> {
  const safe = { ...amount } as Record<string, unknown>;
  for (const field of INTERNAL_ORDER_AMOUNT_FIELDS) delete safe[field];
  return safe as Omit<T, (typeof INTERNAL_ORDER_AMOUNT_FIELDS)[number]>;
}

export type AuthenticatedOrderUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly auditLog: AuditLogService
  ) {}

  async create(user: AuthenticatedOrderUser, dto: CreateOrderDto) {
    const actor = await this.withStoreMember(user);
    return this.createOrderUseCase.execute(actor, dto);
  }

  async list(user: AuthenticatedOrderUser, dto: ListOrdersDto) {
    const actor = await this.withStoreMember(user);
    if (!OrderPolicy.canViewStoreOrders(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);
    const where = this.buildOrderWhere(actor, dto);
    const canViewCosts = PermissionPolicy.canManageFinance(actor, dto.storeId);
    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, companyName: true, contactPerson: true } },
          vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } },
          salesPerson: { select: { id: true, username: true, nickname: true } },
          constructionRecord: { select: { status: true } },
          amount: true
        }
      })
    ]);

    return {
      total,
      page,
      pageSize,
      items: items.map((item) => ({
        ...item,
        amount: item.amount ? {
          ...(canViewCosts ? item.amount : redactOrderAmount(item.amount)),
          pricingMode: getOrderPricingMode(item.amount)
        } : null,
        status: getEffectiveOrderStatus(item.status, item.constructionRecord?.status)
      }))
    };
  }

  async exportDetails(user: AuthenticatedOrderUser, dto: ExportOrderDetailsDto) {
    const actor = await this.withStoreMember(user);
    if (!OrderPolicy.canViewStoreOrders(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const canViewCosts = PermissionPolicy.canManageFinance(actor, dto.storeId);

    const orders = await this.prisma.order.findMany({
      where: this.buildOrderWhere(actor, dto),
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, companyName: true, contactPerson: true } },
        vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
        constructionRecord: { select: { status: true } },
        costSettlement: canViewCosts ? {
          select: {
            status: true,
            actualMaterialCostCents: true,
            actualConstructionCostCents: true,
            actualTotalCostCents: true,
            actualGrossProfitCents: true,
            actualGrossMarginBps: true
          }
        } : false,
        amount: true,
        items: { include: { product: true } }
      }
    });

    const rows = orders.flatMap((order) => order.items.map((item) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      customerName: order.customer.companyName ?? order.customer.name ?? order.customer.contactPerson ?? "",
      vehicle: [order.vehicle?.carPlate, order.vehicle?.carModel, order.vehicle?.carColor].filter(Boolean).join(" / "),
      status: getEffectiveOrderStatus(order.status, order.constructionRecord?.status),
      constructionType: order.constructionType,
      appointmentDate: order.appointmentDate,
      appointmentTimeSlot: order.appointmentTimeSlot,
      createdAt: order.createdAt,
      productId: item.productId,
      productBrand: item.product.brand,
      productName: item.product.name,
      productModel: item.product.model,
      productSpecification: item.product.specification,
      quantity: toNullableNumber(item.quantity),
      salesUnit: item.salesUnit ?? item.product.salesUnit,
      unitPriceCents: item.unitPriceCents,
      itemAmountCents: item.amountCents,
      productAmountCents: order.amount?.productAmountCents ?? 0,
       constructionChargeCents: order.amount?.constructionChargeCents ?? order.amount?.laborCostCents ?? 0,
       orderTotalCents: order.amount?.totalAmountCents ?? 0,
      paidAmountCents: order.amount?.paidAmountCents ?? 0,
      outstandingCents: order.amount?.outstandingCents ?? 0,
       pricingMode: getOrderPricingMode(order.amount),
       ...(canViewCosts ? {
         estimatedMaterialCostCents: order.amount?.estimatedMaterialCostCents ?? null,
         estimatedConstructionCostCents: order.amount?.estimatedConstructionCostCents ?? null,
         estimatedTotalCostCents: order.amount?.estimatedTotalCostCents ?? null,
         costCompleteness: order.amount?.costCompleteness ?? null,
         actualMaterialCostCents: order.costSettlement?.actualMaterialCostCents ?? null,
         actualConstructionCostCents: order.costSettlement?.actualConstructionCostCents ?? null,
         actualTotalCostCents: order.costSettlement?.actualTotalCostCents ?? null,
         actualGrossProfitCents: order.costSettlement?.actualGrossProfitCents ?? null,
         actualGrossMarginBps: order.costSettlement?.actualGrossMarginBps ?? null,
         costSettlementStatus: order.costSettlement?.status ?? null
       } : {})
    })));

    return rows.sort((left, right) => compareSalesExportRows(left, right, dto.exportDimension ?? "customer"));
  }

  async detail(user: AuthenticatedOrderUser, id: string) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, companyName: true, contactPerson: true } },
        vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } },
        salesPerson: { select: { id: true, username: true, nickname: true } },
        items: { include: { product: true, inventoryAllocations: true } },
        amount: true,
        payments: { orderBy: { paidAt: "desc" }, include: { account: true } },
        amendmentRequests: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!order) {
      throw new NotFoundException("订单不存在");
    }
    this.assertCanViewOrder(actor, order.storeId, order.salesPersonId);
    const canViewCosts = PermissionPolicy.canManageFinance(actor, order.storeId);
    return {
      ...order,
      items: order.items.map((item) => ({ ...item, quantity: toNullableNumber(item.quantity) })),
      amount: order.amount ? {
        ...(canViewCosts ? order.amount : redactOrderAmount(order.amount)),
        pricingMode: getOrderPricingMode(order.amount)
      } : null
    };
  }

  async addPayment(user: AuthenticatedOrderUser, orderId: string, dto: CreateOrderPaymentDto) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { amount: true }
      });
      if (!order?.amount) {
        throw new NotFoundException("订单不存在");
      }
      if (!OrderPolicy.canManagePayment(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }

      const account = await tx.paymentAccount.findUnique({ where: { id: dto.accountId } });
      if (!account || account.storeId !== order.storeId || !account.isActive) {
        throw new BadRequestException("收款账户不可用");
      }

      const payment = await tx.orderPayment.create({
        data: {
          orderId,
          accountId: dto.accountId,
          paymentType: dto.paymentType,
          amountCents: dto.amountCents,
          paidAt: new Date(dto.paidAt),
          createdById: actor.id
        }
      });

      // 订单收款既是订单维度的收款记录，也是已经发生的资金收入。
      // 用订单收款 ID 作为来源，支持一张订单的多笔收款且保证幂等。
      await tx.paymentRecord.create({
        data: {
          storeId: order.storeId,
          accountId: dto.accountId,
          type: PaymentRecordType.ORDER_PAYMENT,
          direction: PaymentDirection.INCOME,
          amountCents: dto.amountCents,
          sourceId: payment.id,
          note: "订单收款",
          createdById: actor.id,
          occurredAt: new Date(dto.paidAt)
        }
      });

      const aggregate = await tx.orderPayment.aggregate({
        where: { orderId },
        _sum: { amountCents: true }
      });
      const paidAmountCents = aggregate._sum.amountCents ?? 0;
      const outstandingCents = order.amount.totalAmountCents - paidAmountCents;
      if (outstandingCents < 0) {
        throw new BadRequestException("收款金额不能超过订单总额");
      }

      await tx.orderAmount.update({
        where: { orderId },
        data: {
          paidAmountCents,
          outstandingCents
        }
      });

      return payment;
    });
  }

  async listPayments(user: AuthenticatedOrderUser, orderId: string) {
    const order = await this.detail(user, orderId);
    return order.payments;
  }

  async updateCommercials(
    user: AuthenticatedOrderUser,
    orderId: string,
    dto: UpdateOrderCommercialsDto
  ) {
    const actor = await this.withStoreMember(user);
    const reason = dto.changeReason?.trim();
    if (!reason) {
      throw new BadRequestException("修改订单必须填写原因");
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { inventoryAllocations: true } },
          amount: true,
          amendmentRequests: { where: { status: OrderAmendmentStatus.APPROVED }, select: { id: true } }
        }
      });
      if (!order?.amount) {
        throw new NotFoundException("订单不存在");
      }
      const hasApprovedAmendment = (order.amendmentRequests?.length ?? 0) > 0;
      if (order.amount.pricingCalculationId && !hasApprovedAmendment) {
        throw new BadRequestException("正式订单价格快照已冻结，不能修改产品清单或成交价");
      }
      if (!canManageOrderCommercials(actor, order.storeId, order.salesPersonId)) {
        throw new ForbiddenException("无权限");
      }
      if (!isOrderCommercialsEditableStatus(order.status)) {
        throw new BadRequestException("当前订单状态不能修改产品清单");
      }
      if (order.amount.outstandingCents <= 0 && !hasApprovedAmendment) {
        throw new BadRequestException("订单收款已确认完成，不能修改产品清单");
      }
      if (hasApprovedAmendment && dto.remark !== undefined && dto.remark !== order.remark) {
        throw new BadRequestException("已结算订单改单仅允许修改产品、数量、单价和施工收费");
      }

      const constructionChargeCents = getCommercialConstructionChargeCents(dto);

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId: order.storeId }
      });
      const activeProductIds = new Set(
        products
          .filter((product) => product.status === ProductStatus.ACTIVE)
          .map((product) => product.id)
      );
      if (activeProductIds.size !== productIds.length) {
        throw new BadRequestException("订单包含不存在或已停用的产品");
      }

      const nextItems = dto.items.map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        amountCents: multiplyMoneyCents(item.unitPriceCents, item.quantity)
      }));
      const productAmountCents = nextItems.reduce((sum, item) => sum + item.amountCents, 0);
      const totalAmountCents = productAmountCents + constructionChargeCents;
      const settlementDifferenceCents = totalAmountCents - order.amount.paidAmountCents;
      const outstandingCents = Math.max(0, settlementDifferenceCents);
      const profitCents = calculateProfitCents(
        totalAmountCents,
        order.amount.materialCostCents,
        order.amount.salesCommissionCents
      );
      if (settlementDifferenceCents < 0 && !hasApprovedAmendment) {
        throw new BadRequestException("订单金额不能小于已收款金额");
      }

      const before = {
        items: order.items.map(toOrderItemAuditSummary),
        amount: toOrderAmountAuditSummary(order.amount),
        remark: order.remark
      };
      const afterAmount = {
        productAmountCents,
        laborCostCents: constructionChargeCents,
        totalAmountCents,
        paidAmountCents: order.amount.paidAmountCents,
        outstandingCents,
        settlementDifferenceCents,
        materialCostCents: order.amount.materialCostCents,
        salesCommissionCents: order.amount.salesCommissionCents,
        profitCents
      };

      await syncOrderItemsForCommercialUpdate(tx, orderId, order.items, nextItems);
      await tx.orderAmount.update({
        where: { orderId },
        data: {
          productAmountCents,
          laborCostCents: constructionChargeCents,
          constructionChargeCents,
          constructionChargeAdjustmentReason: dto.changeReason,
          totalAmountCents,
          outstandingCents,
          settlementDifferenceCents,
          profitCents
        }
      });
      await tx.order.update({
        where: { id: orderId },
        // A settled-order amendment is a commercial adjustment only.  It must
        // not change order context such as the customer, appointment or remark.
        data: { remark: hasApprovedAmendment ? order.remark : dto.remark }
      });
      if (hasApprovedAmendment) {
        await tx.orderAmendmentRequest.updateMany({
          where: { orderId, status: OrderAmendmentStatus.APPROVED },
          data: { status: OrderAmendmentStatus.COMPLETED }
        });
      }

      const auditEvent = {
        action: "ORDER_COMMERCIALS_UPDATED",
        actorId: actor.id,
        targetType: "order",
        targetId: orderId,
        metadata: {
          storeId: order.storeId,
          reason,
          before,
          after: {
            items: nextItems,
            amount: afterAmount,
            remark: dto.remark
          }
        }
      };
      await persistAuditEvent(tx, auditEvent);
      this.auditLog.record(auditEvent);

      return { id: orderId };
    });
  }

  async createAmendmentRequest(user: AuthenticatedOrderUser, orderId: string, dto: CreateOrderAmendmentRequestDto) {
    const actor = await this.withStoreMember(user);
    const reason = dto.reason.trim();
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { amount: true, payments: { orderBy: { paidAt: "desc" }, take: 1 } }
    });
    if (!order?.amount) throw new NotFoundException("订单不存在");
    if (!canManageOrderCommercials(actor, order.storeId, order.salesPersonId)) {
      throw new ForbiddenException("仅订单店长、客服或负责销售员可重新提交改单申请");
    }
    if (order.amount.outstandingCents > 0) throw new BadRequestException("订单尚未结清，无需申请结算后金额修改");
    const settledAt = order.payments[0]?.paidAt;
    if (!settledAt || !isCurrentShanghaiMonth(settledAt)) {
      throw new BadRequestException("仅允许申请修改本月已结算订单；跨月订单已冻结");
    }
    const existingRequest = await this.prisma.orderAmendmentRequest.findFirst({
      where: {
        orderId,
        status: { in: [OrderAmendmentStatus.PENDING, OrderAmendmentStatus.APPROVED, OrderAmendmentStatus.COMPLETED] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existingRequest?.status === OrderAmendmentStatus.PENDING) {
      throw new BadRequestException("该订单已有待审批的金额修改申请");
    }
    if (existingRequest) {
      throw new BadRequestException("该订单本月已完成一次结算后金额修改，不能再次申请");
    }
    const request = await this.prisma.orderAmendmentRequest.create({
      data: { storeId: order.storeId, orderId, reason, requestedById: actor.id }
    });
    const auditEvent = {
      action: "ORDER_AMENDMENT_REQUESTED", actorId: actor.id, targetType: "order", targetId: orderId,
      metadata: { storeId: order.storeId, requestId: request.id, reason, settledAt }
    };
    await persistAuditEvent(this.prisma, auditEvent);
    this.auditLog.record(auditEvent);
    return request;
  }

  async reviewAmendmentRequest(
    user: AuthenticatedOrderUser,
    orderId: string,
    requestId: string,
    dto: ReviewOrderAmendmentRequestDto
  ) {
    const actor = await this.withStoreMember(user);
    const request = await this.prisma.orderAmendmentRequest.findFirst({
      where: { id: requestId, orderId }, include: { order: { include: { amount: true, payments: { orderBy: { paidAt: "desc" }, take: 1 } } } }
    });
    if (!request?.order.amount) throw new NotFoundException("改单申请不存在");
    if (!PermissionPolicy.canViewStoreData(actor, request.storeId) || (!actor.isAuditor && actor.storeMember?.position !== StorePosition.FINANCE)) {
      throw new ForbiddenException("仅财务可审批改单申请");
    }
    if (request.requestedById === actor.id) throw new ForbiddenException("申请人不能审批自己的改单申请");
    if (request.status !== OrderAmendmentStatus.PENDING) throw new BadRequestException("该改单申请已处理");
    if (!isCurrentShanghaiMonth(request.order.payments[0]?.paidAt)) throw new BadRequestException("跨月订单已冻结，不能审批改单申请");
    const approved = dto.action === "APPROVE";
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.orderAmendmentRequest.update({
        where: { id: requestId },
        data: { status: approved ? OrderAmendmentStatus.APPROVED : OrderAmendmentStatus.REJECTED, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: dto.reviewNote.trim() }
      });
      const auditEvent = {
        action: approved ? "ORDER_AMENDMENT_APPROVED" : "ORDER_AMENDMENT_REJECTED", actorId: actor.id, targetType: "order", targetId: orderId,
        metadata: {
          storeId: request.storeId,
          requestId,
          decision: approved ? "APPROVED" : "REJECTED",
          reviewNote: dto.reviewNote.trim(),
          scope: "COMMERCIALS_ONLY"
        }
      };
      await persistAuditEvent(tx, auditEvent);
      this.auditLog.record(auditEvent);
      return next;
    });
    return updated;
  }

  async returnToPendingDispatch(user: AuthenticatedOrderUser, orderId: string, dto: ReturnOrderDto) {
    const actor = await this.withStoreMember(user);
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("反审核退回必须填写原因");
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          storeId: true,
          salesPersonId: true,
          status: true
        }
      });
      if (!order) {
        throw new NotFoundException("订单不存在");
      }
      if (!canManageOrderCommercials(actor, order.storeId, order.salesPersonId)) {
        throw new ForbiddenException("无权限");
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException("已取消订单不能退回修改");
      }
      if (order.status === OrderStatus.PENDING_DISPATCH) {
        return { id: orderId, status: OrderStatus.PENDING_DISPATCH };
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PENDING_DISPATCH },
        select: { id: true, status: true }
      });
      const auditEvent = {
        action: "ORDER_RETURNED_TO_PENDING_DISPATCH",
        actorId: actor.id,
        targetType: "order",
        targetId: orderId,
        metadata: {
          storeId: order.storeId,
          reason,
          beforeStatus: order.status,
          afterStatus: OrderStatus.PENDING_DISPATCH
        }
      };
      await persistAuditEvent(tx, auditEvent);
      this.auditLog.record(auditEvent);
      return updated;
    });
  }

  async listAuditEvents(user: AuthenticatedOrderUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { storeId: true, salesPersonId: true }
    });
    if (!order) {
      throw new NotFoundException("订单不存在");
    }
    this.assertCanViewOrder(actor, order.storeId, order.salesPersonId);

    const events = await this.prisma.auditEvent.findMany({
      where: { targetType: "order", targetId: orderId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return this.withAuditActors(events);
  }

  async createPaymentAccount(user: AuthenticatedOrderUser, dto: CreatePaymentAccountDto) {
    const actor = await this.withStoreMember(user);
    if (!OrderPolicy.canCreatePaymentAccount(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.paymentAccount.create({
      data: {
        storeId: dto.storeId,
        name: dto.name,
        type: dto.type,
        bankName: dto.bankName,
        accountNo: dto.accountNo,
        isDefault: dto.isDefault ?? false,
        isActive: true
      }
    });
  }

  async listPaymentAccounts(user: AuthenticatedOrderUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!OrderPolicy.canViewStoreOrders(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.paymentAccount.findMany({
      where: { storeId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
    });
  }

  async listPaymentAccountAuditEvents(user: AuthenticatedOrderUser, id: string) {
    const actor = await this.withStoreMember(user);
    const account = await this.prisma.paymentAccount.findUnique({
      where: { id },
      select: { storeId: true }
    });
    if (!account) {
      throw new NotFoundException("收款账户不存在");
    }
    if (!OrderPolicy.canManagePayment(actor, account.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const events = await this.prisma.auditEvent.findMany({
      where: { targetType: "paymentAccount", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return this.withAuditActors(events);
  }

  async updatePaymentAccount(
    user: AuthenticatedOrderUser,
    id: string,
    dto: UpdatePaymentAccountDto
  ) {
    const actor = await this.withStoreMember(user);
    const account = await this.prisma.paymentAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException("收款账户不存在");
    }
    if (!OrderPolicy.canManagePayment(actor, account.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const { changeReason, ...data } = dto;
    const reason = changeReason?.trim();
    if (!reason) {
      throw new BadRequestException("修改收款账户必须填写原因");
    }

    const updated = await this.prisma.paymentAccount.update({
      where: { id },
      data
    });

    const changedFields = Object.keys(data).filter(
      (field) => data[field as keyof typeof data] !== undefined
    );
    const auditEvent = {
      action: "PAYMENT_ACCOUNT_UPDATED",
      actorId: actor.id,
      targetType: "paymentAccount",
      targetId: id,
      metadata: {
        storeId: account.storeId,
        reason,
        changedFields,
        before: pickPaymentAccountAuditFields(account, changedFields),
        after: pickPaymentAccountAuditFields(data, changedFields)
      }
    };
    await persistAuditEvent(this.prisma, auditEvent);
    this.auditLog.record(auditEvent);

    return updated;
  }

  async removePaymentAccount(user: AuthenticatedOrderUser, id: string) {
    return this.updatePaymentAccount(user, id, { isActive: false, changeReason: "停用收款账户" });
  }

  private buildOrderWhere(user: UserWithStoreMember, dto: ListOrdersDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      storeId: dto.storeId,
      status: dto.status,
      constructionType: dto.constructionType
    };
    const createdAt = this.buildCreatedAtFilter(dto);
    if (createdAt) {
      where.createdAt = createdAt;
    }
    const paymentFilter = this.buildPaymentFilter(dto.paymentStatus);
    if (paymentFilter) {
      where.amount = { is: paymentFilter };
    }
    if (!user.isAuditor && user.storeMember?.position === "SALES") {
      where.salesPersonId = user.id;
    }
    const andFilters: Prisma.OrderWhereInput[] = [];
    if (dto.invoiceable) {
      andFilters.push({
        OR: [
          { status: { in: [OrderStatus.COMPLETED, OrderStatus.WARRANTIED] } },
          { constructionRecord: { is: { status: ConstructionTaskStatus.COMPLETED } } }
        ]
      });
    }
    const q = dto.q?.trim();
    if (q) {
      andFilters.push({ OR: this.buildSearchConditions(q) });
    }
    if (andFilters.length > 0) {
      where.AND = andFilters;
    }
    return where;
  }

  private buildSearchConditions(q: string): Prisma.OrderWhereInput[] {
    const conditions: Prisma.OrderWhereInput[] = [
      { orderNo: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { vehicle: { carPlate: { contains: q, mode: "insensitive" } } }
    ];
    if (/^1\d{10}$/.test(q)) {
      conditions.push({ customer: { phoneHash: hashSensitiveField(q) } });
    }
    if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(q)) {
      conditions.push({ vehicle: { vinHash: hashSensitiveField(q) } });
    }
    return conditions;
  }

  private buildCreatedAtFilter(dto: ListOrdersDto) {
    if (!dto.createdFrom && !dto.createdTo) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (dto.createdFrom) {
      filter.gte = new Date(dto.createdFrom);
    }
    if (dto.createdTo) {
      const to = new Date(dto.createdTo);
      to.setUTCHours(23, 59, 59, 999);
      filter.lte = to;
    }
    return filter;
  }

  private buildPaymentFilter(paymentStatus?: ListOrdersDto["paymentStatus"]) {
    if (!paymentStatus) return undefined;
    if (paymentStatus === "UNPAID") {
      return { paidAmountCents: 0 };
    }
    if (paymentStatus === "PARTIAL") {
      return {
        paidAmountCents: { gt: 0 },
        outstandingCents: { gt: 0 }
      };
    }
    return { outstandingCents: 0 };
  }

  private assertCanViewOrder(user: UserWithStoreMember, storeId: string, salesPersonId: string) {
    if (!PermissionPolicy.canViewStoreData(user, storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (!user.isAuditor && user.storeMember?.position === "SALES" && user.id !== salesPersonId) {
      throw new ForbiddenException("无权限");
    }
  }

  private async withStoreMember(user: AuthenticatedOrderUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) {
      return user;
    }

    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });

    return {
      id: user.id,
      isAuditor: user.isAuditor,
      storeMember: member
    };
  }

  private async withAuditActors<T extends { actorId?: string | null }>(events: T[]) {
    const actorIds = [...new Set(events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))];
    if (actorIds.length === 0) return events;

    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, username: true, nickname: true }
    });
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
    return events.map((event) => ({
      ...event,
      actor: event.actorId ? actorMap.get(event.actorId) : undefined
    }));
  }
}

function pickPaymentAccountAuditFields(source: Record<string, unknown>, fields: string[]) {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    picked[field] = field === "accountNo" ? maskAccountNo(source[field]) : source[field];
  }
  return picked;
}

function maskAccountNo(value: unknown) {
  if (typeof value !== "string") return value;
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

function canManageOrderCommercials(user: UserWithStoreMember, storeId: string, salesPersonId: string) {
  if (PermissionPolicy.isAdmin(user) || PermissionPolicy.isStoreManager(user, storeId)) return true;
  if (PermissionPolicy.isStoreMember(user, storeId) && user.storeMember?.position === CUSTOMER_SERVICE) return true;
  return PermissionPolicy.isStoreMember(user, storeId) &&
    user.storeMember?.position === StorePosition.SALES &&
    user.id === salesPersonId;
}

function compareSalesExportRows(
  left: {
    orderNo: string;
    customerName: string;
    appointmentDate: Date | null;
    createdAt: Date;
    productBrand: string;
    productName: string;
    productModel: string;
  },
  right: {
    orderNo: string;
    customerName: string;
    appointmentDate: Date | null;
    createdAt: Date;
    productBrand: string;
    productName: string;
    productModel: string;
  },
  dimension: "customer" | "date" | "product"
) {
  const leftKey = dimension === "date"
    ? (left.appointmentDate ?? left.createdAt).toISOString()
    : dimension === "product"
      ? `${left.productBrand}\u0000${left.productName}\u0000${left.productModel}`
      : left.customerName;
  const rightKey = dimension === "date"
    ? (right.appointmentDate ?? right.createdAt).toISOString()
    : dimension === "product"
      ? `${right.productBrand}\u0000${right.productName}\u0000${right.productModel}`
      : right.customerName;
  return leftKey.localeCompare(rightKey, "zh-CN") || left.orderNo.localeCompare(right.orderNo, "zh-CN");
}

function isOrderCommercialsEditableStatus(status: OrderStatus) {
  const editableStatuses: OrderStatus[] = [
    OrderStatus.PENDING_DISPATCH,
    OrderStatus.DISPATCHED,
    OrderStatus.IN_CONSTRUCTION,
    OrderStatus.COMPLETED,
    // A warranty record does not make an unpaid order commercially immutable.
    // The remaining receivable is still derived from the adjusted order total.
    OrderStatus.WARRANTIED
  ];
  return editableStatuses.includes(status);
}

function getCommercialConstructionChargeCents(dto: UpdateOrderCommercialsDto) {
  const value = dto.constructionChargeCents ?? dto.laborCostCents;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException("本单施工收费必须是大于或等于 0 的整数分值");
  }
  return value;
}

function isCurrentShanghaiMonth(value?: Date) {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit"
  });
  return formatter.format(value) === formatter.format(new Date());
}

function getEffectiveOrderStatus(
  orderStatus: OrderStatus,
  constructionStatus?: "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED" | null
) {
  if (orderStatus === OrderStatus.CANCELLED || orderStatus === OrderStatus.WARRANTIED) {
    return orderStatus;
  }
  if (constructionStatus === "COMPLETED") return OrderStatus.COMPLETED;
  if (constructionStatus === "IN_CONSTRUCTION") return OrderStatus.IN_CONSTRUCTION;
  if (constructionStatus === "DISPATCHED") return OrderStatus.DISPATCHED;
  return orderStatus;
}

type ExistingCommercialOrderItem = {
  id?: string;
  inventoryAllocations?: Array<{
    status?: string | null;
    lockedQuantity?: unknown;
    outboundQuantity?: unknown;
  }>;
};

type NextCommercialOrderItem = {
  id?: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

async function syncOrderItemsForCommercialUpdate(
  tx: Prisma.TransactionClient,
  orderId: string,
  existingItems: ExistingCommercialOrderItem[],
  nextItems: NextCommercialOrderItem[]
) {
  const nextItemsHaveIds = nextItems.some((item) => Boolean(item.id));
  if (!nextItemsHaveIds) {
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.orderItem.createMany({
      data: nextItems.map(({ id: _id, ...item }) => ({
        orderId,
        ...item
      }))
    });
    return;
  }

  const existingItemsById = new Map(existingItems.filter((item) => item.id).map((item) => [item.id!, item]));
  const nextItemIds = new Set(nextItems.map((item) => item.id).filter(Boolean) as string[]);
  for (const itemId of nextItemIds) {
    if (!existingItemsById.has(itemId)) {
      throw new BadRequestException("订单明细不存在或不属于当前订单");
    }
  }

  for (const item of nextItems) {
    const { id, ...data } = item;
    if (id) {
      await tx.orderItem.update({ where: { id }, data });
    } else {
      await tx.orderItem.create({ data: { orderId, ...data } });
    }
  }

  for (const item of existingItems) {
    if (!item.id || nextItemIds.has(item.id)) continue;
    assertCanRemoveCommercialOrderItem(item);
    await tx.orderItem.deleteMany({ where: { id: item.id } });
  }
}

function assertCanRemoveCommercialOrderItem(item: ExistingCommercialOrderItem) {
  const allocations = item.inventoryAllocations ?? [];
  const hasOutbound = allocations.some(
    (allocation) => allocation.status === "OUTBOUND" || toNullableNumber(allocation.outboundQuantity) > 0
  );
  if (hasOutbound) {
    throw new BadRequestException("已出库的订单产品不能直接删除，请通过库存调整处理差异");
  }
  const hasActiveLock = allocations.some(
    (allocation) =>
      allocation.status === "LOCKED"
      && toNullableNumber(allocation.lockedQuantity) > toNullableNumber(allocation.outboundQuantity)
  );
  if (hasActiveLock) {
    throw new BadRequestException("已锁库的订单产品不能直接删除，请先释放库存或在库存匹配中调整");
  }
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    return Number(value.toString());
  }
  return 0;
}

function toOrderItemAuditSummary(item: {
  productId: string;
  quantity: unknown;
  unitPriceCents: number;
  amountCents: number;
}) {
  return {
    productId: item.productId,
    quantity: toNullableNumber(item.quantity),
    unitPriceCents: item.unitPriceCents,
    amountCents: item.amountCents
  };
}

function toOrderAmountAuditSummary(amount: {
  productAmountCents: number;
  laborCostCents: number;
  totalAmountCents: number;
  paidAmountCents: number;
  outstandingCents: number;
  materialCostCents?: number;
  salesCommissionCents?: number;
  profitCents?: number;
}) {
  return {
    productAmountCents: amount.productAmountCents,
    laborCostCents: amount.laborCostCents,
    totalAmountCents: amount.totalAmountCents,
    paidAmountCents: amount.paidAmountCents,
    outstandingCents: amount.outstandingCents,
    materialCostCents: amount.materialCostCents ?? 0,
    salesCommissionCents: amount.salesCommissionCents ?? 0,
    profitCents: amount.profitCents ?? calculateProfitCents(
      amount.totalAmountCents,
      amount.materialCostCents ?? 0,
      amount.salesCommissionCents ?? 0
    )
  };
}

function calculateProfitCents(totalAmountCents: number, materialCostCents: number, salesCommissionCents: number) {
  return totalAmountCents - materialCostCents - salesCommissionCents;
}

async function persistAuditEvent(
  prisma: {
    auditEvent: {
      create(args: { data: Prisma.AuditEventUncheckedCreateInput }): Promise<unknown>;
    };
  },
  event: AuditEvent
) {
  await prisma.auditEvent.create({
    data: {
      action: event.action,
      actorId: event.actorId,
      storeId: typeof event.metadata?.storeId === "string" ? event.metadata.storeId : undefined,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: (event.metadata ?? {}) as Prisma.InputJsonObject
    }
  });
}

function hashSensitiveField(value: string) {
  const keyMaterial = process.env.SENSITIVE_FIELD_KEY ?? "mallbay-dev-sensitive-key";
  const hashSalt = process.env.SENSITIVE_FIELD_HASH_SALT ?? keyMaterial;
  return createHash("sha256").update(`${hashSalt}:${value}`).digest("hex");
}


function getOrderPricingMode(amount: { pricingCalculationId?: string | null } | null | undefined) {
  return amount?.pricingCalculationId ? "ACTIVE" as const : "LEGACY" as const;
}

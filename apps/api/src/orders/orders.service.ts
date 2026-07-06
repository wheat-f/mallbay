/* eslint-disable @typescript-eslint/consistent-type-imports */
import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma, ProductStatus, StorePosition } from "@prisma/client";
import { normalizePagination } from "../common/pagination";
import {
  PermissionPolicy,
  type UserWithStoreMember
} from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService, type AuditEvent } from "../observability/audit-log.service";
import { OrderPolicy } from "./domain/order-policy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateOrderPaymentDto } from "./dto/create-order-payment.dto";
import { CreatePaymentAccountDto } from "./dto/create-payment-account.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { ReturnOrderDto } from "./dto/return-order.dto";
import { UpdateOrderCommercialsDto } from "./dto/update-order-commercials.dto";
import { UpdatePaymentAccountDto } from "./dto/update-payment-account.dto";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";

const CUSTOMER_SERVICE = "CUSTOMER_SERVICE" as StorePosition;

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
          amount: true
        }
      })
    ]);

    return { total, page, pageSize, items };
  }

  async detail(user: AuthenticatedOrderUser, id: string) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, companyName: true, contactPerson: true } },
        vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } },
        items: { include: { product: true, inventoryAllocations: true } },
        amount: true,
        payments: { orderBy: { paidAt: "desc" }, include: { account: true } }
      }
    });
    if (!order) {
      throw new NotFoundException("订单不存在");
    }
    this.assertCanViewOrder(actor, order.storeId, order.salesPersonId);
    return order;
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
          amount: true
        }
      });
      if (!order?.amount) {
        throw new NotFoundException("订单不存在");
      }
      if (!canManageOrderCommercials(actor, order.storeId, order.salesPersonId)) {
        throw new ForbiddenException("无权限");
      }
      if (!isOrderCommercialsEditableStatus(order.status)) {
        throw new BadRequestException("当前订单状态不能修改产品清单");
      }
      if (order.amount.outstandingCents <= 0) {
        throw new BadRequestException("订单收款已确认完成，不能修改产品清单");
      }

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
        amountCents: item.quantity * item.unitPriceCents
      }));
      const productAmountCents = nextItems.reduce((sum, item) => sum + item.amountCents, 0);
      const totalAmountCents = productAmountCents + dto.laborCostCents;
      const outstandingCents = totalAmountCents - order.amount.paidAmountCents;
      const profitCents = calculateProfitCents(
        totalAmountCents,
        order.amount.materialCostCents,
        order.amount.salesCommissionCents
      );
      if (outstandingCents < 0) {
        throw new BadRequestException("订单金额不能小于已收款金额");
      }

      const before = {
        items: order.items.map(toOrderItemAuditSummary),
        amount: toOrderAmountAuditSummary(order.amount),
        remark: order.remark
      };
      const afterAmount = {
        productAmountCents,
        laborCostCents: dto.laborCostCents,
        totalAmountCents,
        paidAmountCents: order.amount.paidAmountCents,
        outstandingCents,
        materialCostCents: order.amount.materialCostCents,
        salesCommissionCents: order.amount.salesCommissionCents,
        profitCents
      };

      await syncOrderItemsForCommercialUpdate(tx, orderId, order.items, nextItems);
      await tx.orderAmount.update({
        where: { orderId },
        data: {
          productAmountCents,
          laborCostCents: dto.laborCostCents,
          totalAmountCents,
          outstandingCents,
          profitCents
        }
      });
      await tx.order.update({
        where: { id: orderId },
        data: { remark: dto.remark }
      });

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
    const q = dto.q?.trim();
    if (q) {
      where.OR = this.buildSearchConditions(q);
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

function isOrderCommercialsEditableStatus(status: OrderStatus) {
  const editableStatuses: OrderStatus[] = [
    OrderStatus.PENDING_DISPATCH,
    OrderStatus.DISPATCHED,
    OrderStatus.IN_CONSTRUCTION,
    OrderStatus.COMPLETED
  ];
  return editableStatuses.includes(status);
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
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}) {
  return {
    productId: item.productId,
    quantity: item.quantity,
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

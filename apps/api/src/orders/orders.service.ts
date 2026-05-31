import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizePagination } from "../common/pagination";
import {
  PermissionPolicy,
  type UserWithStoreMember
} from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { OrderPolicy } from "./domain/order-policy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateOrderPaymentDto } from "./dto/create-order-payment.dto";
import { CreatePaymentAccountDto } from "./dto/create-payment-account.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { UpdatePaymentAccountDto } from "./dto/update-payment-account.dto";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";

export type AuthenticatedOrderUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly createOrderUseCase: CreateOrderUseCase
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
        items: { include: { product: true } },
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

  async createPaymentAccount(user: AuthenticatedOrderUser, dto: CreatePaymentAccountDto) {
    const actor = await this.withStoreMember(user);
    if (!OrderPolicy.canManagePayment(actor, dto.storeId)) {
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

    return this.prisma.paymentAccount.update({
      where: { id },
      data: dto
    });
  }

  async removePaymentAccount(user: AuthenticatedOrderUser, id: string) {
    return this.updatePaymentAccount(user, id, { isActive: false });
  }

  private buildOrderWhere(user: UserWithStoreMember, dto: ListOrdersDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      storeId: dto.storeId,
      status: dto.status
    };
    if (!user.isAuditor && user.storeMember?.position === "SALES") {
      where.salesPersonId = user.id;
    }
    const q = dto.q?.trim();
    if (q) {
      where.OR = [
        { orderNo: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { companyName: { contains: q, mode: "insensitive" } } },
        { vehicle: { carPlate: { contains: q, mode: "insensitive" } } }
      ];
    }
    return where;
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
}

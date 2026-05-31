/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { OrderStatus, ProductStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../../common/policies/permission.policy";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateOrderDto } from "../dto/create-order.dto";

export const ORDER_NUMBER_GENERATOR = Symbol("ORDER_NUMBER_GENERATOR");

export type OrderNumberGenerator = {
  next(): string;
};

@Injectable()
export class CreateOrderUseCase {
  private readonly orderNumber: OrderNumberGenerator;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(ORDER_NUMBER_GENERATOR)
    orderNumber?: OrderNumberGenerator
  ) {
    this.orderNumber = orderNumber ?? createDefaultOrderNumberGenerator();
  }

  async execute(user: UserWithStoreMember, dto: CreateOrderDto) {
    if (!PermissionPolicy.canCreateOrder(user, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer || customer.storeId !== dto.storeId) {
        throw new NotFoundException("客户不存在");
      }

      if (dto.vehicleId) {
        const vehicle = await tx.customerVehicle.findUnique({ where: { id: dto.vehicleId } });
        if (!vehicle || vehicle.customerId !== dto.customerId) {
          throw new BadRequestException("车辆不属于该客户");
        }
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId: dto.storeId }
      });
      const activeProductIds = new Set(
        products
          .filter((product) => product.status === ProductStatus.ACTIVE)
          .map((product) => product.id)
      );
      if (activeProductIds.size !== productIds.length) {
        throw new BadRequestException("订单包含不存在或已停用的产品");
      }

      const productAmountCents = dto.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0
      );
      const laborCostCents = dto.laborCostCents;
      const totalAmountCents = productAmountCents + laborCostCents;
      const paidAmountCents = dto.deposit?.amountCents ?? 0;
      const outstandingCents = totalAmountCents - paidAmountCents;

      if (outstandingCents < 0) {
        throw new BadRequestException("收款金额不能超过订单总额");
      }

      const order = await tx.order.create({
        data: {
          storeId: dto.storeId,
          orderNo: this.orderNumber.next(),
          customerId: dto.customerId,
          vehicleId: dto.vehicleId,
          salesPersonId: user.id,
          constructionType: dto.constructionType,
          constructionLocation: dto.constructionLocation,
          constructionAddress: dto.constructionAddress,
          appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
          appointmentTimeSlot: dto.appointmentTimeSlot,
          status: OrderStatus.PENDING_DISPATCH,
          remark: dto.remark
        }
      });

      await tx.orderItem.createMany({
        data: dto.items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          amountCents: item.quantity * item.unitPriceCents
        }))
      });

      await tx.orderAmount.create({
        data: {
          orderId: order.id,
          productAmountCents,
          laborCostCents,
          totalAmountCents,
          paidAmountCents,
          outstandingCents
        }
      });

      if (dto.deposit) {
        await tx.orderPayment.create({
          data: {
            orderId: order.id,
            accountId: dto.deposit.accountId,
            paymentType: dto.deposit.paymentType,
            amountCents: dto.deposit.amountCents,
            paidAt: new Date(dto.deposit.paidAt),
            createdById: user.id
          }
        });
      }

      return order;
    });
  }
}

function createDefaultOrderNumberGenerator(): OrderNumberGenerator {
  return {
    next() {
      const now = new Date();
      const date = [
        now.getFullYear(),
        `${now.getMonth() + 1}`.padStart(2, "0"),
        `${now.getDate()}`.padStart(2, "0")
      ].join("");
      const suffix = `${now.getTime() % 1000000}`.padStart(6, "0");
      return `ORD${date}${suffix}`;
    }
  };
}

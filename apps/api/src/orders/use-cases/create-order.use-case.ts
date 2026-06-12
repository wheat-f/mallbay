/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { ConstructionLocation, ConstructionType, OrderStatus, ProductStatus } from "@prisma/client";
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
    @Inject(PrismaService) private readonly prisma: PrismaService,
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
    const constructionAddress = normalizeOptionalText(dto.constructionAddress);
    const appointmentTimeSlot = normalizeOptionalText(dto.appointmentTimeSlot);
    if (dto.constructionLocation === ConstructionLocation.OUTSIDE && !constructionAddress) {
      throw new BadRequestException("外出地址不能为空");
    }
    if (dto.appointmentDate && !appointmentTimeSlot) {
      throw new BadRequestException("预约时段不能为空");
    }
    if (!dto.appointmentDate && appointmentTimeSlot) {
      throw new BadRequestException("预约日期不能为空");
    }

    return this.prisma.$transaction(async (tx) => {
      const capacityReservation = dto.appointmentDate
        ? await this.reserveDailyCapacity(
          tx,
          dto.storeId,
          dto.appointmentDate,
          dto.constructionLocation,
          dto.constructionType
        )
        : null;
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer || customer.storeId !== dto.storeId) {
        throw new NotFoundException("客户不存在");
      }
      if (!PermissionPolicy.canViewCustomer(user, customer.storeId, customer.ownerUserId)) {
        throw new ForbiddenException("无权限");
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
      const suggestedLaborCostCents = dto.suggestedLaborCostCents;
      const laborCostAdjustmentReason = normalizeOptionalText(dto.laborCostAdjustmentReason);
      if (
        suggestedLaborCostCents !== undefined &&
        suggestedLaborCostCents !== laborCostCents &&
        !laborCostAdjustmentReason
      ) {
        throw new BadRequestException("调整施工人工费必须填写原因");
      }
      const totalAmountCents = productAmountCents + laborCostCents;
      const paidAmountCents = dto.deposit?.amountCents ?? 0;
      const outstandingCents = totalAmountCents - paidAmountCents;

      if (outstandingCents < 0) {
        throw new BadRequestException("收款金额不能超过订单总额");
      }

      if (dto.deposit) {
        const account = await tx.paymentAccount.findUnique({ where: { id: dto.deposit.accountId } });
        if (!account || account.storeId !== dto.storeId || !account.isActive) {
          throw new BadRequestException("收款账户不可用");
        }
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
          constructionAddress,
          appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
          appointmentTimeSlot,
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
          suggestedLaborCostCents,
          laborCostAdjustmentReason,
          totalAmountCents,
          paidAmountCents,
          outstandingCents,
          materialCostCents: 0,
          salesCommissionCents: 0,
          profitCents: calculateProfitCents(totalAmountCents, 0, 0)
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

      if (capacityReservation) {
        await tx.dailyCapacity.update(capacityReservation);
      }

      return order;
    });
  }

  private async reserveDailyCapacity(
    tx: {
      dailyCapacity: {
        findUnique(args: unknown): Promise<DailyCapacityLike | null>;
        update(args: unknown): Promise<unknown>;
      };
    },
    storeId: string,
    appointmentDate: string,
    location: ConstructionLocation,
    type: ConstructionType
  ) {
    const date = normalizeCapacityDate(appointmentDate);
    const capacity = await tx.dailyCapacity.findUnique({
      where: { storeId_date: { storeId, date } }
    });
    if (!capacity) {
      throw new BadRequestException("请先设置施工容量");
    }

    const increments: Record<string, { increment: number }> = {};
    if (location === ConstructionLocation.IN_STORE) {
      assertCapacityAvailable(capacity.inStoreReserved, capacity.inStoreCapacity);
      increments.inStoreReserved = { increment: 1 };
    } else {
      assertCapacityAvailable(capacity.outsideReserved, capacity.outsideCapacity);
      increments.outsideReserved = { increment: 1 };
    }

    if (type === ConstructionType.HEAT_FILM) {
      assertCapacityAvailable(capacity.heatFilmReserved, capacity.heatFilmCapacity);
      increments.heatFilmReserved = { increment: 1 };
    }
    if (type === ConstructionType.INSPECTION) {
      assertCapacityAvailable(capacity.inspectionReserved, capacity.inspectionCapacity);
      increments.inspectionReserved = { increment: 1 };
    }

    return {
      where: { id: capacity.id },
      data: increments
    };
  }
}

type DailyCapacityLike = {
  id: string;
  inStoreCapacity: number;
  inStoreReserved: number;
  outsideCapacity: number;
  outsideReserved: number;
  heatFilmCapacity: number;
  heatFilmReserved: number;
  inspectionCapacity: number;
  inspectionReserved: number;
};

function assertCapacityAvailable(reserved: number, capacity: number) {
  if (reserved >= capacity) {
    throw new BadRequestException("施工容量已满");
  }
}

function normalizeCapacityDate(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  return new Date(`${datePart}T00:00:00.000Z`);
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function calculateProfitCents(totalAmountCents: number, materialCostCents: number, salesCommissionCents: number) {
  return totalAmountCents - materialCostCents - salesCommissionCents;
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

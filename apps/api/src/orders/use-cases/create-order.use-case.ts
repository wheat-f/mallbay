/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { CapacityReservationSourceType, CapacityReservationStatus, ConstructionLocation, ConstructionType, OrderStatus, Prisma, ProductStatus, ProductUnit } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../../common/policies/permission.policy";
import { PrismaService } from "../../prisma/prisma.service";
import { PricingService } from "../../pricing/pricing.service";
import { multiplyMoneyCents } from "../../pricing/domain/money";
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
    orderNumber?: OrderNumberGenerator,
    @Optional()
    @Inject(PricingService)
    private readonly pricing?: PricingService
  ) {
    this.orderNumber = orderNumber ?? createDefaultOrderNumberGenerator();
  }

  async execute(user: UserWithStoreMember, dto: CreateOrderDto, options: { approvedQuote?: boolean } = {}) {
    if (!PermissionPolicy.canCreateOrder(user, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (dto.salesPersonId && dto.salesPersonId !== user.id && !PermissionPolicy.isStoreManager(user, dto.storeId)) {
      throw new ForbiddenException("无权限指定其他销售人员");
    }
    const salesPersonId = dto.salesPersonId ?? user.id;
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

    const pricingSnapshot = dto.pricingCalculationId
      ? await this.pricing?.validateOrder(user, {
        storeId: dto.storeId,
        pricingCalculationId: dto.pricingCalculationId,
        items: dto.items,
        laborCostCents: dto.laborCostCents,
        estimatedCostCents: dto.estimatedCostCents
      }, options)
      : null;
    if (dto.pricingCalculationId && !pricingSnapshot) {
      throw new BadRequestException("价格试算服务不可用，请重新试算");
    }

    return this.prisma.$transaction(async (tx) => {
      const heldCapacityReservation = dto.capacityReservationId
        ? await tx.capacityReservation.findUnique({ where: { id: dto.capacityReservationId } })
        : null;
      if (dto.capacityReservationId && (!heldCapacityReservation || heldCapacityReservation.storeId !== dto.storeId ||
        heldCapacityReservation.sourceType !== CapacityReservationSourceType.QUOTE ||
        heldCapacityReservation.constructionLocation !== dto.constructionLocation ||
        heldCapacityReservation.constructionType !== dto.constructionType ||
        heldCapacityReservation.date.getTime() !== normalizeCapacityDate(dto.appointmentDate ?? "").getTime() ||
        (heldCapacityReservation.status !== CapacityReservationStatus.HELD && heldCapacityReservation.status !== CapacityReservationStatus.CONFIRMED))) {
        throw new BadRequestException("容量预约占位不存在或已释放");
      }
      if (heldCapacityReservation && !dto.appointmentDate) {
        throw new BadRequestException("使用容量预约占位时必须填写预约日期");
      }
      const capacityReservation = dto.appointmentDate && !heldCapacityReservation
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
      const productsById = new Map(products.map((product) => [product.id, product]));
      for (const item of dto.items) {
        const product = productsById.get(item.productId);
        const precision = product?.quantityPrecision ?? 3;
        if (countDecimalPlaces(item.quantity) > precision) {
          throw new BadRequestException("产品 " + (product?.name ?? item.productId) + " 数量最多支持 " + precision + " 位小数");
        }
      }

      const productAmountCents = dto.items.reduce(
        (sum, item) => sum + multiplyMoneyCents(item.unitPriceCents, item.quantity),
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
          salesPersonId,
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
        data: dto.items.map((item) => {
          const product = productsById.get(item.productId);
          const salesUnit = product?.salesUnit ?? product?.unit ?? ProductUnit.PIECE;
          const baseUnit = product?.inventoryUnit ?? salesUnit;
          const baseQuantityPerSalesUnit =
            salesUnit === ProductUnit.ROLL && product?.metersPerRoll
              ? decimalToNumber(product.metersPerRoll)
              : 1;
          return {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            salesUnit,
            baseUnit,
            baseQuantityPerSalesUnit,
            requiredBaseQuantity: item.quantity * baseQuantityPerSalesUnit,
            unitPriceCents: item.unitPriceCents,
            amountCents: multiplyMoneyCents(item.unitPriceCents, item.quantity)
          };
        })
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
          profitCents: calculateProfitCents(totalAmountCents, 0, 0),
          ...(pricingSnapshot
            ? {
              pricingCalculationId: pricingSnapshot.pricingCalculationId,
              pricingRuleSetVersion: pricingSnapshot.pricingRuleSetVersion,
              pricingInputHash: pricingSnapshot.pricingInputHash,
              pricingOutputSnapshot: pricingSnapshot.pricingOutputSnapshot as Prisma.InputJsonValue
            }
            : {})
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
        if (typeof tx.capacityReservation?.create === "function") await tx.capacityReservation.create({
          data: {
            storeId: dto.storeId,
            dailyCapacityId: capacityReservation.dailyCapacityId,
            date: capacityReservation.date,
            constructionLocation: dto.constructionLocation,
            constructionType: dto.constructionType,
            sourceType: CapacityReservationSourceType.ORDER,
            orderId: order.id,
            status: CapacityReservationStatus.CONFIRMED
          }
        });
      }
      if (heldCapacityReservation) {
        await tx.capacityReservation.update({
          where: { id: heldCapacityReservation.id },
          data: { status: CapacityReservationStatus.CONFIRMED, orderId: order.id }
        });
      }

      return order;
    });
  }

  private async reserveDailyCapacity(
    tx: {
      dailyCapacity: {
        findUnique(args: unknown): Promise<DailyCapacityLike | null>;
        updateMany?(args: unknown): Promise<{ count: number }>;
        update?(args: unknown): Promise<unknown>;
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
    }
    else {
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

    let updated: { count: number };
    if (typeof tx.dailyCapacity.updateMany === "function") {
      updated = await tx.dailyCapacity.updateMany({
        where: { id: capacity.id, ...getDailyCapacityAvailabilityWhere(capacity, location, type) },
        data: increments
      });
    } else {
      if (typeof tx.dailyCapacity.update !== "function") {
        throw new BadRequestException("施工容量服务不可用");
      }
      await tx.dailyCapacity.update({ where: { id: capacity.id }, data: increments });
      updated = { count: 1 };
    }
    if (updated.count !== 1) throw new BadRequestException("施工容量已满，请刷新后重试");
    return { dailyCapacityId: capacity.id, date };
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

function getDailyCapacityAvailabilityWhere(
  capacity: DailyCapacityLike,
  location: ConstructionLocation,
  type: ConstructionType
) {
  const where: Record<string, { lt: number }> = {};
  if (location === ConstructionLocation.IN_STORE) where.inStoreReserved = { lt: capacity.inStoreCapacity };
  else where.outsideReserved = { lt: capacity.outsideCapacity };
  if (type === ConstructionType.HEAT_FILM) where.heatFilmReserved = { lt: capacity.heatFilmCapacity };
  if (type === ConstructionType.INSPECTION) where.inspectionReserved = { lt: capacity.inspectionCapacity };
  return where;
}

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

function decimalToNumber(value: number | { toNumber?: () => number; toString: () => string }) {
  if (typeof value === "number") return value;
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value.toString());
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


function countDecimalPlaces(value: number) {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const decimalLength = coefficient.includes(".")
    ? coefficient.length - coefficient.indexOf(".") - 1
    : 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return exponent < 0 ? Math.max(0, decimalLength + exponent * -1) : Math.max(0, decimalLength - exponent);
}

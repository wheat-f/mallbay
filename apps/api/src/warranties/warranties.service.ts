/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, StorePosition, WarrantyStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateWarrantyDto, ListWarrantiesDto } from "./dto/warranty.dto";

export type AuthenticatedWarrantyUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class WarrantiesService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromOrder(user: AuthenticatedWarrantyUser, dto: CreateWarrantyDto) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: {
          items: { include: { product: true } },
          constructionRecord: { include: { photos: true } }
        }
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (!PermissionPolicy.canCreateWarranty(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.WARRANTIED) {
        throw new BadRequestException("只有已完工订单可以生成质保");
      }
      if (order.status === OrderStatus.WARRANTIED) {
        const existing = await tx.warranty.findUnique({
          where: { orderId: order.id },
          include: { photos: true }
        });
        if (existing) return existing;
        throw new BadRequestException("订单状态已是质保中，但质保卡不存在，请先修复订单数据");
      }

      const startDate = normalizeDate(dto.startDate ?? new Date().toISOString());
      const endDate = dto.endDate
        ? normalizeDate(dto.endDate)
        : addYears(startDate, Math.max(1, ...order.items.map((item) => item.product.warrantyYears ?? 1)));
      const warranty = await tx.warranty.create({
        data: {
          storeId: order.storeId,
          orderId: order.id,
          customerId: order.customerId,
          vehicleId: order.vehicleId,
          warrantyNo: buildWarrantyNo(),
          status: WarrantyStatus.ACTIVE,
          scope: dto.scope,
          startDate,
          endDate,
          createdById: actor.id,
          photos: {
            create: (order.constructionRecord?.photos ?? []).map((photo) => ({
              constructionPhotoId: photo.id,
              url: photo.url
            }))
          }
        },
        include: { photos: true }
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.WARRANTIED }
      });
      return warranty;
    });
  }

  async list(user: AuthenticatedWarrantyUser, query: ListWarrantiesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewWarranty(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const where = buildWarrantyListScope(actor, query.storeId);
    return this.prisma.warranty.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { photos: true, order: warrantyOrderSummaryInclude }
    });
  }

  async detail(user: AuthenticatedWarrantyUser, id: string) {
    const actor = await this.withStoreMember(user);
    const warranty = await this.prisma.warranty.findUnique({
      where: { id },
      include: { photos: true, order: warrantyOrderSummaryInclude }
    });
    if (!warranty) throw new NotFoundException("质保记录不存在");
    if (!canViewWarrantyRecord(actor, warranty.storeId, warranty.order.salesPersonId)) {
      throw new ForbiddenException("无权限");
    }
    return warranty;
  }

  async lookup(warrantyNo: string) {
    return this.prisma.warranty.findUnique({
      where: { warrantyNo },
      include: { photos: true, order: warrantyOrderSummaryInclude }
    });
  }

  private async withStoreMember(user: AuthenticatedWarrantyUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) {
      return user;
    }
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

function buildWarrantyListScope(actor: UserWithStoreMember, storeId: string) {
  const where: { storeId: string; order?: { salesPersonId: string } } = { storeId };
  if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
    where.order = { salesPersonId: actor.id };
  }
  return where;
}

function canViewWarrantyRecord(actor: UserWithStoreMember, storeId: string, salesPersonId: string) {
  if (!PermissionPolicy.canViewWarranty(actor, storeId)) return false;
  if (actor.isAuditor || actor.storeMember?.position !== StorePosition.SALES) return true;
  return actor.id === salesPersonId;
}

function normalizeDate(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  return new Date(`${datePart}T00:00:00.000Z`);
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function buildWarrantyNo() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `WAR${stamp}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

const warrantyOrderSummaryInclude = {
  select: {
    salesPersonId: true,
    orderNo: true,
    customer: { select: { name: true, companyName: true, contactPerson: true } },
    vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
  }
};

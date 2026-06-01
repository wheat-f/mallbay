/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AfterSaleStatus, StorePosition } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { AssignAfterSaleDto, CreateAfterSaleDto, JudgeAfterSaleDto, ListAfterSalesDto } from "./dto/after-sales.dto";

export type AuthenticatedAfterSalesUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class AfterSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedAfterSalesUser, dto: CreateAfterSaleDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { warranty: true }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, order.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.afterSale.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        warrantyId: order.warranty?.id,
        customerId: order.customerId,
        description: dto.description,
        createdById: actor.id
      }
    });
  }

  async list(user: AuthenticatedAfterSalesUser, query: ListAfterSalesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.afterSale.findMany({
      where: { storeId: query.storeId },
      orderBy: { createdAt: "desc" },
      include: { assignments: true, penalties: true }
    });
  }

  async assign(user: AuthenticatedAfterSalesUser, id: string, dto: AssignAfterSaleDto) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const workerIds = [...new Set(dto.workerUserIds)];
    const members = await this.prisma.storeMember.findMany({
      where: {
        storeId: afterSale.storeId,
        userId: { in: workerIds },
        position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
      }
    });
    if (members.length !== workerIds.length) {
      throw new BadRequestException("售后施工人员必须属于本门店且岗位有效");
    }
    await this.prisma.afterSaleAssignment.createMany({
      data: workerIds.map((workerUserId) => ({
        afterSaleId: id,
        workerUserId,
        assignedById: actor.id
      })),
      skipDuplicates: true
    });
    return this.prisma.afterSale.update({
      where: { id },
      data: { status: AfterSaleStatus.ASSIGNED }
    });
  }

  async judgeResponsibility(user: AuthenticatedAfterSalesUser, id: string, dto: JudgeAfterSaleDto) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const updated = await this.prisma.afterSale.update({
      where: { id },
      data: {
        responsibility: dto.responsibility,
        resolutionNote: dto.resolutionNote,
        status: AfterSaleStatus.RESOLVED
      }
    });
    if (dto.penaltyWorkerUserId && dto.penaltyAmountCents && dto.penaltyAmountCents > 0) {
      await this.prisma.penalty.create({
        data: {
          afterSaleId: id,
          workerUserId: dto.penaltyWorkerUserId,
          amountCents: dto.penaltyAmountCents,
          reason: dto.penaltyReason ?? "售后责任处罚",
          createdById: actor.id
        }
      });
    }
    return updated;
  }

  private async withStoreMember(user: AuthenticatedAfterSalesUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

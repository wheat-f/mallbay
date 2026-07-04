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
        issuePhotoUrls: sanitizePhotoUrls(dto.issuePhotoUrls),
        createdById: actor.id
      }
    });
  }

  async list(user: AuthenticatedAfterSalesUser, query: ListAfterSalesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const where = buildAfterSalesListScope(actor, query.storeId);
    return this.prisma.afterSale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        storeId: true,
        orderId: true,
        warrantyId: true,
        customerId: true,
        description: true,
        status: true,
        responsibility: true,
        issuePhotoUrls: true,
        constructionPhotoUrls: true,
        constructionIssueCategory: true,
        resolutionNote: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        assignments: true,
        penalties: true,
        warranty: { select: { warrantyNo: true, status: true, scope: true } },
        order: {
          select: {
            orderNo: true,
            customer: { select: { name: true, companyName: true, contactPerson: true } },
            vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
          }
        }
      }
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
        constructionIssueCategory: dto.constructionIssueCategory?.trim() || undefined,
        constructionPhotoUrls: sanitizePhotoUrls(dto.constructionPhotoUrls),
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

  async close(user: AuthenticatedAfterSalesUser, id: string) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (afterSale.status !== AfterSaleStatus.RESOLVED && afterSale.status !== AfterSaleStatus.CLOSED) {
      throw new BadRequestException("售后单需先完成判责处理后才能归档");
    }
    return this.prisma.afterSale.update({
      where: { id },
      data: {
        status: AfterSaleStatus.CLOSED,
        closedAt: new Date()
      }
    });
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

function sanitizePhotoUrls(urls?: string[]) {
  return [...new Set((urls ?? []).map((url) => url.trim()).filter(Boolean))].slice(0, 12);
}

function buildAfterSalesListScope(actor: UserWithStoreMember, storeId: string) {
  const where: {
    storeId: string;
    assignments?: { some: { workerUserId: string } };
    order?: { salesPersonId: string };
  } = { storeId };
  if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
    where.order = { salesPersonId: actor.id };
    return where;
  }
  if (
    !actor.isAuditor &&
    (actor.storeMember?.position === StorePosition.CONSTRUCTION || actor.storeMember?.position === StorePosition.APPRENTICE)
  ) {
    where.assignments = { some: { workerUserId: actor.id } };
  }
  return where;
}

/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { StorePosition } from "@prisma/client";
import { type UserWithStoreMember } from "../permissions/domain/access-types";
import { PrismaService } from "../prisma/prisma.service";
import { AccessContext } from "../permissions/domain/access-context";
import type { ListWarrantiesDto } from "./dto/warranty.dto";

export type AuthenticatedWarrantyUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class WarrantiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  async list(user: AuthenticatedWarrantyUser, query: ListWarrantiesDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.accessContext.can(actor.id, "warranties", "read", { storeId: query.storeId })) {
      throw new ForbiddenException("无权限");
    }
    const where = buildWarrantyListScope(actor, query.storeId, await this.isSalesActor(actor, query.storeId));
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
      include: {
        photos: true,
        order: warrantyOrderSummaryInclude,
        afterSales: { select: { id: true, status: true, description: true, createdAt: true } }
      }
    });
    if (!warranty) throw new NotFoundException("质保记录不存在");
    if (!await this.accessContext.can(actor.id, "warranties", "read", { storeId: warranty.storeId })) {
      throw new ForbiddenException("无权限");
    }
    if (await this.isSalesActor(actor, warranty.storeId) && warranty.order.salesPersonId !== actor.id) {
      throw new ForbiddenException("无权限");
    }
    const afterSaleIds = (warranty.afterSales ?? []).map((afterSale) => afterSale.id);
    const events = this.prisma.auditEvent
      ? await this.prisma.auditEvent.findMany({
          where: {
            OR: [
              { targetType: "warranty", targetId: id },
              ...(afterSaleIds.length ? [{ targetType: "after_sale", targetId: { in: afterSaleIds } }] : [])
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : [];
    return { ...warranty, events };
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

  private async isSalesActor(actor: UserWithStoreMember, storeId: string) {
    const resolution = await this.accessContext.resolve(actor.id, { storeId });
    return resolution.roles.some((role) => role.roleCode === "SALES" &&
      (role.scopeType === "HQ" || role.scopeIds.includes(storeId)));
  }
}

function buildWarrantyListScope(actor: UserWithStoreMember, storeId: string, isSales: boolean) {
  const where: { storeId: string; order?: { salesPersonId: string } } = { storeId };
  if (isSales || (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES)) {
    where.order = { salesPersonId: actor.id };
  }
  return where;
}

const warrantyOrderSummaryInclude = {
  select: {
    salesPersonId: true,
    orderNo: true,
    customer: { select: { name: true, companyName: true, contactPerson: true } },
    vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
  }
};

/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import type { ListWarrantiesDto } from "./dto/warranty.dto";

export type AuthenticatedWarrantyUser = {
  id: string;
  username?: string;
};

@Injectable()
export class WarrantiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  async list(user: AuthenticatedWarrantyUser, query: ListWarrantiesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.accessContext.can(actor, "warranties", "read", { storeId: query.storeId })) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.warranty.findMany({
      where: { storeId: query.storeId },
      orderBy: { createdAt: "desc" },
      include: { photos: true, order: warrantyOrderSummaryInclude }
    });
  }

  async detail(user: AuthenticatedWarrantyUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const warranty = await this.prisma.warranty.findUnique({
      where: { id },
      include: {
        photos: true,
        order: warrantyOrderSummaryInclude,
        afterSales: { select: { id: true, status: true, description: true, createdAt: true } }
      }
    });
    if (!warranty) throw new NotFoundException("质保记录不存在");
    if (!await this.accessContext.can(actor, "warranties", "read", { storeId: warranty.storeId })) {
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

}

const warrantyOrderSummaryInclude = {
  select: {
    salesPersonId: true,
    orderNo: true,
    customer: { select: { name: true, companyName: true, contactPerson: true } },
    vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
  }
};

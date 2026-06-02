/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable } from "@nestjs/common";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ReportQueryDto } from "./dto/reports.dto";

export type AuthenticatedReportUser = UserWithStoreMember & { username?: string };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthenticatedReportUser, query: ReportQueryDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewReports(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const [orders, amount, constructionRecords, afterSales, invoices, rebates] = await Promise.all([
      this.prisma.order.count({ where: { storeId: query.storeId } }),
      this.prisma.orderAmount.aggregate({
        where: { order: { storeId: query.storeId } },
        _sum: { totalAmountCents: true, paidAmountCents: true }
      }),
      this.prisma.constructionRecord.count({ where: { storeId: query.storeId } }),
      this.prisma.afterSale.count({ where: { storeId: query.storeId } }),
      this.prisma.invoice.count({ where: { storeId: query.storeId } }),
      this.prisma.customerRebate.count({ where: { storeId: query.storeId } })
    ]);
    return {
      orders,
      totalAmountCents: amount._sum.totalAmountCents ?? 0,
      paidAmountCents: amount._sum.paidAmountCents ?? 0,
      constructionRecords,
      afterSales,
      invoices,
      rebates
    };
  }

  private async withStoreMember(user: AuthenticatedReportUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

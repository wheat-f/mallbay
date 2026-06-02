/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, PaymentRecordType, RebateStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyRebateDto, ListRebatesDto, PayRebateDto, ReviewRebateDto } from "./dto/rebate.dto";

export type AuthenticatedRebateUser = UserWithStoreMember & { username?: string };

@Injectable()
export class RebatesService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(user: AuthenticatedRebateUser, dto: ApplyRebateDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { amount: true } });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canApplyRebate(actor, order.storeId)) throw new ForbiddenException("无权限");
    const rebateableStatuses: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED];
    if (!rebateableStatuses.includes(order.status)) {
      throw new BadRequestException("已完工订单才能申请返利");
    }
    if ((order.amount?.outstandingCents ?? 1) > 0) {
      throw new BadRequestException("订单未收齐，不能申请返利");
    }
    return this.prisma.customerRebate.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        amountCents: dto.amountCents,
        reason: dto.reason,
        appliedById: actor.id,
        logs: { create: { status: RebateStatus.APPLIED, note: "返利申请", createdById: actor.id } }
      }
    });
  }

  async approve(user: AuthenticatedRebateUser, id: string, dto: ReviewRebateDto) {
    const actor = await this.withStoreMember(user);
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    if (!PermissionPolicy.canApproveRebate(actor, rebate.storeId)) throw new ForbiddenException("无权限");
    const updated = await this.prisma.customerRebate.update({ where: { id }, data: { status: dto.status } });
    await this.prisma.rebateLog.create({ data: { rebateId: id, status: dto.status, note: dto.note, createdById: actor.id } });
    return updated;
  }

  async pay(user: AuthenticatedRebateUser, id: string, dto: PayRebateDto) {
    const actor = await this.withStoreMember(user);
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    if (!PermissionPolicy.canManageFinance(actor, rebate.storeId)) throw new ForbiddenException("无权限");
    const updated = await this.prisma.customerRebate.update({ where: { id }, data: { status: RebateStatus.PAID } });
    await this.prisma.rebateLog.create({ data: { rebateId: id, status: RebateStatus.PAID, note: dto.note, createdById: actor.id } });
    await this.prisma.paymentRecord.create({
      data: {
        storeId: rebate.storeId,
        type: PaymentRecordType.REBATE,
        amountCents: rebate.amountCents,
        sourceId: rebate.id,
        note: dto.note ?? "返利发放",
        createdById: actor.id
      }
    });
    return updated;
  }

  async list(user: AuthenticatedRebateUser, query: ListRebatesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.customerRebate.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" }, include: { logs: true } });
  }

  private async withStoreMember(user: AuthenticatedRebateUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

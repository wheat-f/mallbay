/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConstructionTaskStatus, OrderStatus, PaymentRecordType, RebateStatus, StorePosition } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyRebateDto, ListRebatesDto, PayRebateDto, ReviewRebateDto } from "./dto/rebate.dto";

export type AuthenticatedRebateUser = UserWithStoreMember & { username?: string };
const REBATE_REVIEWED = "REVIEWED" as RebateStatus;

@Injectable()
export class RebatesService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(user: AuthenticatedRebateUser, dto: ApplyRebateDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { amount: true, constructionRecord: { select: { status: true } } } });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canApplyRebateForOrder(actor, order.storeId, order.salesPersonId)) {
      throw new ForbiddenException("无权限");
    }
    const isFulfilled = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED].includes(order.status) || order.constructionRecord?.status === ConstructionTaskStatus.COMPLETED;
    if (!isFulfilled) {
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
    this.assertReviewTransition(actor, rebate.storeId, rebate.status, dto.status);
    const updated = await this.prisma.customerRebate.update({ where: { id }, data: { status: dto.status } });
    await this.prisma.rebateLog.create({ data: { rebateId: id, status: dto.status, note: dto.note, createdById: actor.id } });
    return updated;
  }

  async pay(user: AuthenticatedRebateUser, id: string, dto: PayRebateDto) {
    const actor = await this.withStoreMember(user);
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    if (!PermissionPolicy.canManageFinance(actor, rebate.storeId)) throw new ForbiddenException("无权限");
    if (rebate.status !== RebateStatus.APPROVED) {
      throw new BadRequestException("返利审批通过后才能发放");
    }
    const updated = await this.prisma.customerRebate.update({ where: { id }, data: { status: RebateStatus.PAID } });
    await this.prisma.rebateLog.create({ data: { rebateId: id, status: RebateStatus.PAID, note: dto.note, createdById: actor.id } });
    await this.prisma.paymentRecord.create({
      data: {
        storeId: rebate.storeId,
        type: PaymentRecordType.REBATE,
        direction: "EXPENSE",
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
    const where = buildRebateListScope(actor, query.storeId);
    return this.prisma.customerRebate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        logs: true,
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

  private async withStoreMember(user: AuthenticatedRebateUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private assertReviewTransition(
    actor: UserWithStoreMember,
    storeId: string,
    currentStatus: RebateStatus,
    nextStatus: RebateStatus
  ) {
    if (nextStatus === REBATE_REVIEWED) {
      if (!PermissionPolicy.canReviewRebate(actor, storeId)) throw new ForbiddenException("无权限");
      if (currentStatus !== RebateStatus.APPLIED) throw new BadRequestException("已申请返利才能业务审核");
      return;
    }

    if (nextStatus === RebateStatus.APPROVED) {
      if (PermissionPolicy.canReviewRebate(actor, storeId) && !PermissionPolicy.canApproveRebate(actor, storeId)) {
        throw new BadRequestException("业务审核通过后由财务审批");
      }
      if (!PermissionPolicy.canApproveRebate(actor, storeId)) throw new ForbiddenException("无权限");
      if (currentStatus !== REBATE_REVIEWED) throw new BadRequestException("业务审核后才能财务审批");
      return;
    }

    if (nextStatus === RebateStatus.REJECTED) {
      if (currentStatus === RebateStatus.APPLIED) {
        if (!PermissionPolicy.canReviewRebate(actor, storeId)) throw new ForbiddenException("无权限");
        return;
      }
      if (currentStatus === REBATE_REVIEWED) {
        if (!PermissionPolicy.canApproveRebate(actor, storeId)) throw new ForbiddenException("无权限");
        return;
      }
      throw new BadRequestException("当前返利状态不能驳回");
    }

    if (nextStatus === RebateStatus.PAID) {
      throw new BadRequestException("返利发放请使用发放接口");
    }

    throw new BadRequestException("不支持的返利审核状态");
  }
}

function buildRebateListScope(actor: UserWithStoreMember, storeId: string) {
  const where: { storeId: string; order?: { salesPersonId: string } } = { storeId };
  if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
    where.order = { salesPersonId: actor.id };
  }
  return where;
}

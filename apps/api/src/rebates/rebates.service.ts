/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ConstructionTaskStatus, OrderStatus, RebateStatus } from "@prisma/client";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { ApplyRebateDto, ListRebatesDto, PayRebateDto, ReviewRebateDto } from "./dto/rebate.dto";

export type AuthenticatedRebateUser = {
  id: string;
  username?: string;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  isAuditor?: boolean;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  storeMember?: { storeId: string; position: string } | null;
};
const REBATE_REVIEWED = "REVIEWED" as RebateStatus;

@Injectable()
export class RebatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    @Optional() private readonly finance?: FinanceService
  ) {}

  async apply(user: AuthenticatedRebateUser, dto: ApplyRebateDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { amount: true, constructionRecord: { select: { status: true } } } });
    if (!order) throw new NotFoundException("订单不存在");
    if (!await this.accessContext.can(actor, "rebates", "apply", { storeId: order.storeId, ownerId: order.salesPersonId })) {
      throw new ForbiddenException("无权限");
    }
    const isFulfilled =
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.WARRANTIED ||
      order.constructionRecord?.status === ConstructionTaskStatus.COMPLETED;
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
        appliedById: actor.userId,
        logs: { create: { status: RebateStatus.APPLIED, note: "返利申请", createdById: actor.userId } }
      }
    });
  }

  async approve(user: AuthenticatedRebateUser, id: string, dto: ReviewRebateDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    await this.assertReviewTransition(actor, rebate.storeId, rebate.status, dto.status);
    const updated = await this.prisma.customerRebate.update({ where: { id }, data: { status: dto.status } });
    await this.prisma.rebateLog.create({ data: { rebateId: id, status: dto.status, note: dto.note, createdById: actor.userId } });
    return updated;
  }

  async pay(user: AuthenticatedRebateUser, id: string, dto: PayRebateDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    if (!await this.accessContext.can(actor, "finance", "write", { storeId: rebate.storeId })) throw new ForbiddenException("无权限");
    if (rebate.status !== RebateStatus.APPROVED) {
      throw new BadRequestException("返利审批通过后才能发放");
    }
    if (!this.finance) {
      throw new Error("RebatesService finance writer is not configured");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerRebate.update({ where: { id }, data: { status: RebateStatus.PAID } });
      await tx.rebateLog.create({ data: { rebateId: id, status: RebateStatus.PAID, note: dto.note, createdById: actor.userId } });
      await this.finance!.recordRebatePayout(tx, {
        storeId: rebate.storeId,
        amountCents: rebate.amountCents,
        sourceId: rebate.id,
        note: dto.note ?? "返利发放",
        createdById: actor.userId,
        idempotencyKey: `rebate:${rebate.id}:paid`
      });
      return updated;
    });
  }

  async list(user: AuthenticatedRebateUser, query: ListRebatesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const scope = await this.accessContext.scope(actor, "finance", "write", { storeId: query.storeId, ownerId: actor.userId });
    if (!scope.allowed) throw new ForbiddenException({ code: scope.reason ?? "ACCESS_DENIED", message: "无权限" });
    const where = buildRebateListScope(query.storeId, scope.ownerId);
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

  private async assertReviewTransition(
    actor: AccessSubject,
    storeId: string,
    currentStatus: RebateStatus,
    nextStatus: RebateStatus
  ) {
    if (nextStatus === REBATE_REVIEWED) {
      if (!await this.accessContext.can(actor, "rebates", "review", { storeId })) throw new ForbiddenException("无权限");
      if (currentStatus !== RebateStatus.APPLIED) throw new BadRequestException("已申请返利才能业务审核");
      return;
    }

    if (nextStatus === RebateStatus.APPROVED) {
      if (await this.accessContext.can(actor, "rebates", "review", { storeId })) {
        throw new BadRequestException("业务审核通过后由财务审批");
      }
      if (!await this.accessContext.can(actor, "rebates", "pay", { storeId })) throw new ForbiddenException("无权限");
      if (currentStatus !== REBATE_REVIEWED) throw new BadRequestException("业务审核后才能财务审批");
      return;
    }

    if (nextStatus === RebateStatus.REJECTED) {
      if (currentStatus === RebateStatus.APPLIED) {
        if (!await this.accessContext.can(actor, "rebates", "review", { storeId })) throw new ForbiddenException("无权限");
        return;
      }
      if (currentStatus === REBATE_REVIEWED) {
        if (!await this.accessContext.can(actor, "rebates", "pay", { storeId })) throw new ForbiddenException("无权限");
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

export function buildRebateListScope(storeId: string, salesPersonId?: string) {
  const where: { storeId: string; order?: { salesPersonId: string } } = { storeId };
  if (salesPersonId) where.order = { salesPersonId };
  return where;
}

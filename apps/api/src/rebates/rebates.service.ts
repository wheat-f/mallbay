/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ConstructionTaskStatus, OrderStatus, RebateStatus, StorePosition } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { ApplyRebateDto, ListRebatesDto, PayRebateDto, ReviewRebateDto } from "./dto/rebate.dto";

export type AuthenticatedRebateUser = UserWithStoreMember & { username?: string };
const REBATE_REVIEWED = "REVIEWED" as RebateStatus;

@Injectable()
export class RebatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    @Optional() private readonly finance?: FinanceService
  ) {}

  async apply(user: AuthenticatedRebateUser, dto: ApplyRebateDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { amount: true, constructionRecord: { select: { status: true } } } });
    if (!order) throw new NotFoundException("订单不存在");
    const isSales = await this.isRole(actor, order.storeId, "SALES");
    if (!await this.accessContext.can(actor.id, "finance", "write", { storeId: order.storeId, ownerId: actor.id }) || (isSales && order.salesPersonId !== actor.id)) {
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
        appliedById: actor.id,
        logs: { create: { status: RebateStatus.APPLIED, note: "返利申请", createdById: actor.id } }
      }
    });
  }

  async approve(user: AuthenticatedRebateUser, id: string, dto: ReviewRebateDto) {
    const actor = await this.withStoreMember(user);
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    await this.assertReviewTransition(actor, rebate.storeId, rebate.status, dto.status);
    const updated = await this.prisma.customerRebate.update({ where: { id }, data: { status: dto.status } });
    await this.prisma.rebateLog.create({ data: { rebateId: id, status: dto.status, note: dto.note, createdById: actor.id } });
    return updated;
  }

  async pay(user: AuthenticatedRebateUser, id: string, dto: PayRebateDto) {
    const actor = await this.withStoreMember(user);
    const rebate = await this.prisma.customerRebate.findUnique({ where: { id } });
    if (!rebate) throw new NotFoundException("返利申请不存在");
    if (!await this.accessContext.can(actor.id, "finance", "write", { storeId: rebate.storeId, ownerId: actor.id })) throw new ForbiddenException("无权限");
    if (rebate.status !== RebateStatus.APPROVED) {
      throw new BadRequestException("返利审批通过后才能发放");
    }
    if (!this.finance) {
      throw new Error("RebatesService finance writer is not configured");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerRebate.update({ where: { id }, data: { status: RebateStatus.PAID } });
      await tx.rebateLog.create({ data: { rebateId: id, status: RebateStatus.PAID, note: dto.note, createdById: actor.id } });
      await this.finance!.recordRebatePayout(tx, {
        storeId: rebate.storeId,
        amountCents: rebate.amountCents,
        sourceId: rebate.id,
        note: dto.note ?? "返利发放",
        createdById: actor.id,
        idempotencyKey: `rebate:${rebate.id}:paid`
      });
      return updated;
    });
  }

  async list(user: AuthenticatedRebateUser, query: ListRebatesDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.accessContext.can(actor.id, "finance", "write", { storeId: query.storeId, ownerId: actor.id })) throw new ForbiddenException("无权限");
    const where = buildRebateListScope(query.storeId, await this.isRole(actor, query.storeId, "SALES") ? actor.id : undefined);
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

  private async assertReviewTransition(
    actor: UserWithStoreMember,
    storeId: string,
    currentStatus: RebateStatus,
    nextStatus: RebateStatus
  ) {
    if (nextStatus === REBATE_REVIEWED) {
      if (!await this.isRole(actor, storeId, "MANAGER")) throw new ForbiddenException("无权限");
      if (currentStatus !== RebateStatus.APPLIED) throw new BadRequestException("已申请返利才能业务审核");
      return;
    }

    if (nextStatus === RebateStatus.APPROVED) {
      if (await this.isRole(actor, storeId, "MANAGER")) {
        throw new BadRequestException("业务审核通过后由财务审批");
      }
      if (!await this.isRole(actor, storeId, "FINANCE")) throw new ForbiddenException("无权限");
      if (currentStatus !== REBATE_REVIEWED) throw new BadRequestException("业务审核后才能财务审批");
      return;
    }

    if (nextStatus === RebateStatus.REJECTED) {
      if (currentStatus === RebateStatus.APPLIED) {
        if (!await this.isRole(actor, storeId, "MANAGER")) throw new ForbiddenException("无权限");
        return;
      }
      if (currentStatus === REBATE_REVIEWED) {
        if (!await this.isRole(actor, storeId, "FINANCE")) throw new ForbiddenException("无权限");
        return;
      }
      throw new BadRequestException("当前返利状态不能驳回");
    }

    if (nextStatus === RebateStatus.PAID) {
      throw new BadRequestException("返利发放请使用发放接口");
    }

    throw new BadRequestException("不支持的返利审核状态");
  }

  private async isRole(actor: UserWithStoreMember, storeId: string, roleCode: string) {
    if (actor.isAuditor) return roleCode === "HQ_ADMIN";
    const access = await this.accessContext.resolve(actor.id, { storeId });
    return access.roles.some((role) => role.roleCode === roleCode && (role.scopeType === "HQ" || role.scopeIds.includes(storeId)));
  }
}

export function buildRebateListScope(storeId: string, salesPersonId?: string) {
  const where: { storeId: string; order?: { salesPersonId: string } } = { storeId };
  if (salesPersonId) where.order = { salesPersonId };
  return where;
}

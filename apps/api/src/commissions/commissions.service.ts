/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommissionRuleType } from "@prisma/client";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateSalesCommissionRuleDto,
  GenerateWorkerCommissionsDto,
  ListCommissionRulesDto
} from "./dto/commissions.dto";

export type AuthenticatedCommissionUser = {
  id: string;
  username?: string;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  isAuditor?: boolean;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  storeMember?: { storeId: string; position: string } | null;
};

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService, private readonly accessContext: AccessContext) {}

  private canAccess(actor: AccessSubject, storeId: string) {
    return this.accessContext.can(actor, "commissions", "write", { storeId });
  }

  async createSalesRule(user: AuthenticatedCommissionUser, dto: CreateSalesCommissionRuleDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canAccess(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.salesCommissionRule.create({
      data: {
        storeId: dto.storeId,
        name: dto.name,
        ruleType: dto.ruleType,
        rateBasisPoints: dto.rateBasisPoints,
        fixedAmountCents: dto.fixedAmountCents,
        constructionType: dto.constructionType,
        isActive: dto.isActive ?? true,
        createdById: actor.userId
      }
    });
  }

  async listSalesRules(user: AuthenticatedCommissionUser, query: ListCommissionRulesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canAccess(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.salesCommissionRule.findMany({
      where: { storeId: query.storeId },
      orderBy: { createdAt: "desc" }
    });
  }

  async generateSalesCommission(user: AuthenticatedCommissionUser, orderId: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { amount: true }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!await this.canAccess(actor, order.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const rule = await this.prisma.salesCommissionRule.findFirst({
      where: { storeId: order.storeId, isActive: true },
      orderBy: { createdAt: "desc" }
    });
    const amountCents = calculateSalesCommission(order.amount?.totalAmountCents ?? 0, rule);
    return this.prisma.salesCommissionLog.upsert({
      where: { orderId },
      create: {
        storeId: order.storeId,
        orderId,
        salesUserId: order.salesPersonId,
        amountCents,
        calculationNote: rule ? `按规则 ${rule.name} 生成` : "无有效规则，提成为 0",
        createdById: actor.userId
      },
      update: {
        amountCents,
        calculationNote: rule ? `按规则 ${rule.name} 重新生成` : "无有效规则，提成为 0",
        createdById: actor.userId
      }
    });
  }

  async generateWorkerCommissions(
    user: AuthenticatedCommissionUser,
    recordId: string,
    dto: GenerateWorkerCommissionsDto
  ) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const record = await this.prisma.constructionRecord.findUnique({
      where: { id: recordId },
      include: { assignments: true }
    });
    if (!record) throw new NotFoundException("施工记录不存在");
    if (!await this.canAccess(actor, record.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const adjustments = new Map((dto.adjustments ?? []).map((item) => [item.workerUserId, item.adjustmentCents]));
    const results = [];
    for (const assignment of record.assignments) {
      const adjustmentCents = adjustments.get(assignment.workerUserId) ?? 0;
      const finalAmountCents = dto.baseAmountCents + adjustmentCents;
      results.push(await this.prisma.workerCommission.upsert({
        where: { orderId_workerUserId: { orderId: record.orderId, workerUserId: assignment.workerUserId } },
        create: {
          storeId: record.storeId,
          recordId: record.id,
          orderId: record.orderId,
          workerUserId: assignment.workerUserId,
          amountCents: dto.baseAmountCents,
          adjustmentCents,
          finalAmountCents,
          calculationNote: "Phase 4 基础师傅提成，可人工调整",
          createdById: actor.userId
        },
        update: {
          amountCents: dto.baseAmountCents,
          adjustmentCents,
          finalAmountCents,
          calculationNote: "Phase 4 基础师傅提成，可人工调整",
          createdById: actor.userId
        }
      }));
    }
    return results;
  }

}

function calculateSalesCommission(totalAmountCents: number, rule: { ruleType: CommissionRuleType; rateBasisPoints: number | null; fixedAmountCents: number | null } | null) {
  if (!rule) return 0;
  if (rule.ruleType === CommissionRuleType.FIXED_AMOUNT) {
    return rule.fixedAmountCents ?? 0;
  }
  return Math.round(totalAmountCents * ((rule.rateBasisPoints ?? 0) / 10000));
}

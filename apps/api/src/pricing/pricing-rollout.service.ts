import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { PositionCostRateVersionStatus, PricingRolloutMode, PricingRuleSetStatus } from "@prisma/client";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { SetPricingRolloutDto } from "./dto/pricing-rollout.dto";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class PricingRolloutService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditLogService) {}

  async get(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) throw new ForbiddenException("无权限");
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, pricingRolloutMode: true } });
    if (!store) throw new NotFoundException("门店不存在");
    return store;
  }

  async set(user: PricingAuthenticatedUser, dto: SetPricingRolloutDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.isStoreManager(actor, dto.storeId)) throw new ForbiddenException("只有店长可以切换价格运行模式");
    if (dto.mode === PricingRolloutMode.ACTIVE) {
      const readiness = await this.inspectReadiness(dto.storeId);
      if (!readiness.ready) throw new BadRequestException(`当前门店尚不能启用 ACTIVE：${readiness.errors.join("；")}`);
    }
    const result = await this.prisma.store.update({ where: { id: dto.storeId }, data: { pricingRolloutMode: dto.mode }, select: { id: true, name: true, pricingRolloutMode: true } });
    await this.recordAudit({ action: "pricing_rollout_mode_changed", actorId: actor.id, targetType: "Store", targetId: dto.storeId, metadata: { storeId: dto.storeId, mode: dto.mode } });
    return result;
  }

  async precheck(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) throw new ForbiddenException("无权限");
    return this.inspectReadiness(storeId);
  }

  async migrationPrecheck(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageFinance(actor, storeId)) throw new ForbiddenException("无权限查看成本迁移预检");
    const [totalOrders, legacyOrders, activeOrders, incompleteCostOrders, temporaryCostOrders] = await Promise.all([
      this.prisma.order.count({ where: { storeId } }),
      this.prisma.order.count({ where: { storeId, amount: { is: { pricingCalculationId: null } } } }),
      this.prisma.order.count({ where: { storeId, amount: { is: { pricingCalculationId: { not: null } } } } }),
      this.prisma.order.count({ where: { storeId, amount: { is: { costCompleteness: "MISSING" } } } }),
      this.prisma.order.count({ where: { storeId, amount: { is: { costCompleteness: "TEMPORARY" } } } })
    ]);
    const readiness = await this.inspectReadiness(storeId);
    return {
      ...readiness,
      orders: { totalOrders, legacyOrders, activeOrders, incompleteCostOrders, temporaryCostOrders },
      warnings: [
        ...(legacyOrders > 0 ? ["历史订单仅保留收入语义，不回填或伪造历史施工成本"] : []),
        ...(incompleteCostOrders > 0 ? ["存在成本缺失订单，需在启用 ACTIVE 前补齐标准或按临时成本审批处理"] : []),
        ...(temporaryCostOrders > 0 ? ["存在临时成本订单，应在完工后重点核对预计与实际成本差异"] : [])
      ]
    };
  }

  private async inspectReadiness(storeId: string) {
    const now = new Date();
    const ruleSet = await this.prisma.pricingRuleSet.findFirst({
      where: {
        storeId,
        status: PricingRuleSetStatus.PUBLISHED,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      include: {
        constructionStandards: { where: { enabled: true }, select: { id: true } },
        positionCostRateVersion: { include: { rates: { select: { id: true } } } }
      }
    });
    const errors: string[] = [];
    if (!ruleSet) errors.push("缺少当前生效的已发布建议价版本");
    if (ruleSet && ruleSet.constructionStandards.length === 0) errors.push("当前建议价版本未维护启用的施工收费与工时标准");
    if (ruleSet && !ruleSet.positionCostRateVersion) errors.push("当前建议价版本未关联岗位小时成本版本");
    if (ruleSet?.positionCostRateVersion && ruleSet.positionCostRateVersion.status !== PositionCostRateVersionStatus.PUBLISHED) errors.push("关联的岗位小时成本版本未发布");
    if (ruleSet?.positionCostRateVersion && ruleSet.positionCostRateVersion.rates.length === 0) errors.push("关联的岗位小时成本版本没有费率明细");
    return {
      ready: errors.length === 0,
      errors,
      ruleSet: ruleSet ? { id: ruleSet.id, version: ruleSet.version, standards: ruleSet.constructionStandards.length, positionCostRateVersionId: ruleSet.positionCostRateVersionId } : null
    };
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async recordAudit(event: AuditEvent) {
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

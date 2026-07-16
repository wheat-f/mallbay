import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, PricingRuleSetStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreatePricingRuleSetDto,
  ListPricingRuleSetsDto
} from "./dto/pricing-rules.dto";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditLogService) {}

  async list(user: PricingAuthenticatedUser, dto: ListPricingRuleSetsDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, dto.storeId);
    return this.prisma.pricingRuleSet.findMany({
      where: { storeId: dto.storeId },
      orderBy: { version: "desc" },
      include: { rules: { orderBy: [{ group: "asc" }, { priority: "desc" }, { sortOrder: "asc" }] }, protectionPolicy: true }
    });
  }

  async createDraft(user: PricingAuthenticatedUser, dto: CreatePricingRuleSetDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    validateProtectionPolicy(dto.protectionPolicy);
    validateRuleDefinitions(dto.rules);
    if (dto.effectiveTo && new Date(dto.effectiveTo) <= new Date(dto.effectiveFrom)) {
      throw new BadRequestException("规则生效结束时间必须晚于开始时间");
    }

    const version = await this.nextVersion(dto.storeId);
    const ruleSet = await this.prisma.pricingRuleSet.create({
      data: {
        storeId: dto.storeId,
        version,
        status: PricingRuleSetStatus.DRAFT,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        createdById: actor.id,
        rules: {
          create: dto.rules.map((rule) => ({
            group: rule.group,
            target: rule.target,
            name: rule.name.trim(),
            conditions: rule.conditions as unknown as Prisma.InputJsonValue,
            actionType: rule.actionType,
            actionValue: rule.actionValue,
            priority: rule.priority ?? 0,
            sortOrder: rule.sortOrder ?? 0,
            enabled: rule.enabled ?? true
          }))
        },
        protectionPolicy: {
          create: {
            normalDeviationBps: dto.protectionPolicy.normalDeviationBps,
            approvalDeviationBps: dto.protectionPolicy.approvalDeviationBps,
            minimumMarginBps: dto.protectionPolicy.minimumMarginBps,
            blockBelowMarginBps: dto.protectionPolicy.blockBelowMarginBps,
            softHoldHours: dto.protectionPolicy.softHoldHours ?? 24,
            allowSpecialApproval: dto.protectionPolicy.allowSpecialApproval ?? false,
            internalLaborCostConfig: dto.protectionPolicy.internalLaborCostConfig as Prisma.InputJsonValue
          }
        }
      },
      include: { rules: true, protectionPolicy: true }
    });
    await this.recordAudit({ action: "pricing_rule_draft_created", actorId: actor.id, targetType: "PricingRuleSet", targetId: ruleSet.id, metadata: { storeId: dto.storeId, version } });
    return ruleSet;
  }

  async createDefaultDraft(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, storeId);
    const existing = await this.prisma.pricingRuleSet.findFirst({
      where: { storeId },
      orderBy: { version: "desc" },
      include: { rules: true, protectionPolicy: true }
    });
    if (existing) return { created: false, ruleSet: existing };
    const version = await this.nextVersion(storeId);
    const ruleSet = await this.prisma.pricingRuleSet.create({
      data: {
        storeId,
        version,
        status: PricingRuleSetStatus.DRAFT,
        effectiveFrom: new Date(),
        createdById: actor.id,
        rules: { create: [] },
        protectionPolicy: {
          create: {
            normalDeviationBps: 500,
            approvalDeviationBps: 1500,
            minimumMarginBps: 2000,
            blockBelowMarginBps: 0,
            softHoldHours: 24,
            allowSpecialApproval: false,
            internalLaborCostConfig: {}
          }
        }
      },
      include: { rules: true, protectionPolicy: true }
    });
    await this.recordAudit({ action: "pricing_rule_default_draft_created", actorId: actor.id, targetType: "PricingRuleSet", targetId: ruleSet.id, metadata: { storeId, version } });
    return { created: true, ruleSet };
  }

  async publish(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, storeId);
    const ruleSet = await this.prisma.pricingRuleSet.findFirst({
      where: { id, storeId },
      include: { rules: true, protectionPolicy: true }
    });
    if (!ruleSet) throw new NotFoundException("价格规则版本不存在");
    if (ruleSet.status !== PricingRuleSetStatus.DRAFT) {
      throw new BadRequestException("只有草稿规则版本可以发布");
    }
    if (!ruleSet.protectionPolicy) throw new BadRequestException("规则版本缺少保护策略");
    validateRuleDefinitions(ruleSet.rules.map((rule) => ({ ...rule, conditions: rule.conditions as never })) as never);
    validateRuleConflicts(ruleSet.rules);

    const published = await this.prisma.$transaction(async (tx) => {
      if (ruleSet.effectiveFrom <= new Date()) {
        await tx.pricingRuleSet.updateMany({
          where: { storeId, status: PricingRuleSetStatus.PUBLISHED, id: { not: ruleSet.id } },
          data: { status: PricingRuleSetStatus.RETIRED }
        });
      }
      return tx.pricingRuleSet.update({
        where: { id: ruleSet.id },
        data: {
          status: PricingRuleSetStatus.PUBLISHED,
          publishedById: actor.id,
          publishedAt: new Date()
        },
        include: { rules: true, protectionPolicy: true }
      });
    });
    await this.recordAudit({ action: "pricing_rule_published", actorId: actor.id, targetType: "PricingRuleSet", targetId: published.id, metadata: { storeId, version: published.version } });
    return published;
  }

  async validate(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, storeId);
    const ruleSet = await this.prisma.pricingRuleSet.findFirst({ where: { id, storeId }, include: { rules: true, protectionPolicy: true } });
    if (!ruleSet) throw new NotFoundException("价格规则版本不存在");
    const errors: string[] = [];
    if (!ruleSet.protectionPolicy) errors.push("缺少保护策略");
    try {
      validateRuleDefinitions(ruleSet.rules.map((rule) => ({ ...rule, conditions: rule.conditions as never })) as never);
      validateRuleConflicts(ruleSet.rules);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "规则定义无效");
    }
    return { valid: errors.length === 0, errors, status: ruleSet.status, version: ruleSet.version };
  }

  async retire(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, storeId);
    const result = await this.prisma.pricingRuleSet.updateMany({ where: { id, storeId, status: PricingRuleSetStatus.PUBLISHED }, data: { status: PricingRuleSetStatus.RETIRED } });
    if (result.count !== 1) throw new BadRequestException("只有已发布规则版本可以停用");
    const retired = await this.prisma.pricingRuleSet.findUnique({ where: { id }, include: { rules: true, protectionPolicy: true } });
    await this.recordAudit({ action: "pricing_rule_retired", actorId: actor.id, targetType: "PricingRuleSet", targetId: id, metadata: { storeId } });
    return retired;
  }

  async copy(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, storeId);
    const source = await this.prisma.pricingRuleSet.findFirst({ where: { id, storeId }, include: { rules: true, protectionPolicy: true } });
    if (!source || !source.protectionPolicy) throw new NotFoundException("可复制的规则版本不存在");
    const version = await this.nextVersion(storeId);
    const copied = await this.prisma.pricingRuleSet.create({
      data: {
        storeId,
        version,
        status: PricingRuleSetStatus.DRAFT,
        effectiveFrom: new Date(),
        createdById: actor.id,
        sourceTemplateVersionId: source.id,
        rules: {
          create: source.rules.map((rule) => ({
            group: rule.group,
            target: rule.target,
            name: rule.name,
            conditions: rule.conditions as Prisma.InputJsonValue,
            actionType: rule.actionType,
            actionValue: rule.actionValue,
            priority: rule.priority,
            sortOrder: rule.sortOrder,
            enabled: rule.enabled
          }))
        },
        protectionPolicy: {
          create: {
            normalDeviationBps: source.protectionPolicy.normalDeviationBps,
            approvalDeviationBps: source.protectionPolicy.approvalDeviationBps,
            minimumMarginBps: source.protectionPolicy.minimumMarginBps,
            blockBelowMarginBps: source.protectionPolicy.blockBelowMarginBps,
            softHoldHours: source.protectionPolicy.softHoldHours,
            allowSpecialApproval: source.protectionPolicy.allowSpecialApproval,
            internalLaborCostConfig: source.protectionPolicy.internalLaborCostConfig as Prisma.InputJsonValue
          }
        }
      },
      include: { rules: true, protectionPolicy: true }
    });
    await this.recordAudit({ action: "pricing_rule_copied", actorId: actor.id, targetType: "PricingRuleSet", targetId: copied.id, metadata: { storeId, sourceRuleSetId: source.id, version } });
    return copied;
  }

  async getForCalculation(storeId: string, id?: string) {
    return this.prisma.pricingRuleSet.findFirst({
      where: {
        storeId,
        status: PricingRuleSetStatus.PUBLISHED,
        ...(id ? { id } : {}),
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }]
      },
      orderBy: { version: "desc" },
      include: { rules: true, protectionPolicy: true }
    });
  }

  private async recordAudit(event: AuditEvent) {
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }

  private async nextVersion(storeId: string) {
    const latest = await this.prisma.pricingRuleSet.findFirst({ where: { storeId }, orderBy: { version: "desc" }, select: { version: true } });
    return (latest?.version ?? 0) + 1;
  }

  private assertCanView(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.canViewStoreData(user, storeId)) throw new ForbiddenException("无权限");
  }

  private assertCanManage(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.canManageProduct(user, storeId)) throw new ForbiddenException("无权限");
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

function validateProtectionPolicy(policy: CreatePricingRuleSetDto["protectionPolicy"]) {
  if (policy.approvalDeviationBps < policy.normalDeviationBps) {
    throw new BadRequestException("审批偏差阈值不能低于普通偏差阈值");
  }
  if (policy.blockBelowMarginBps !== undefined && policy.blockBelowMarginBps > policy.minimumMarginBps) {
    throw new BadRequestException("毛利硬底线不能高于审批毛利底线");
  }
}

function validateRuleConflicts(rules: Array<{ group: string; target: string; priority: number; conditions: unknown; enabled: boolean }>) {
  const seen = new Set<string>();
  for (const rule of rules.filter((item) => item.enabled)) {
    const key = `${rule.target}:${rule.group}:${rule.priority}:${JSON.stringify(rule.conditions)}`;
    if (seen.has(key)) throw new BadRequestException("规则版本存在相同条件、相同优先级的冲突规则");
    seen.add(key);
  }
}

function validateRuleDefinitions(rules: CreatePricingRuleSetDto["rules"]) {
  const operators = new Set(["EQ", "IN", "BETWEEN", "GTE", "LTE"]);
  const fields = new Set(["productId", "productCategory", "productBrand", "productModel", "salesUnit", "quantity", "vehicleClassCode", "constructionType", "constructionLocation", "lineCount", "totalQuantity", "effectiveAt"]);
  for (const rule of rules) {
    if (!rule.name.trim()) throw new BadRequestException("规则名称不能为空");
    if ((rule.actionType === "ADD_CENTS" || rule.actionType === "SUBTRACT_CENTS") && rule.actionValue < 0) {
      throw new BadRequestException("金额调整值不能为负数");
    }
    for (const condition of rule.conditions) {
      if (!condition.field.trim() || !fields.has(condition.field) || !operators.has(condition.operator)) {
        throw new BadRequestException("规则条件字段或运算符无效");
      }
      if (condition.operator === "BETWEEN" && (!Array.isArray(condition.value) || condition.value.length !== 2)) {
        throw new BadRequestException("BETWEEN 条件必须提供两个边界值");
      }
      if (condition.operator === "IN" && (!Array.isArray(condition.value) || condition.value.length === 0)) {
        throw new BadRequestException("IN 条件至少需要一个候选值");
      }
    }
    if ((rule.actionType === "DISCOUNT_BPS" || rule.actionType === "MULTIPLY_BPS") && (rule.actionValue > 10000 || rule.actionValue < -10000)) {
      throw new BadRequestException("基点调整值不能超过 10000");
    }
  }
}

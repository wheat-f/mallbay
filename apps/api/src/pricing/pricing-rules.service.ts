import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, PricingRuleSetStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreatePricingRuleSetDto,
  ListPricingRuleSetsDto,
  UpdatePricingRuleSetDto
} from "./dto/pricing-rules.dto";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

const ruleSetInclude = Prisma.validator<Prisma.PricingRuleSetInclude>()({
  rules: { orderBy: [{ group: "asc" }, { priority: "desc" }, { sortOrder: "asc" }] },
  protectionPolicy: true,
  positionCostRateVersion: { include: { rates: { orderBy: { positionTypeCode: "asc" } } } },
  constructionStandards: {
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      serviceItem: true,
      vehiclePriceClass: true,
      crewRoles: { orderBy: { positionTypeCode: "asc" } }
    }
  }
});

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditLogService) {}

  async list(user: PricingAuthenticatedUser, dto: ListPricingRuleSetsDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, dto.storeId);
    return this.prisma.pricingRuleSet.findMany({
      where: { storeId: dto.storeId },
      orderBy: { version: "desc" },
      include: ruleSetInclude
    });
  }

  async get(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, storeId);
    const ruleSet = await this.prisma.pricingRuleSet.findFirst({
      where: { id, storeId },
      include: ruleSetInclude
    });
    if (!ruleSet) throw new NotFoundException("价格规则版本不存在");
    return ruleSet;
  }

  async updateDraft(user: PricingAuthenticatedUser, id: string, dto: UpdatePricingRuleSetDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    validateProtectionPolicy(dto.protectionPolicy);
    validateRuleDefinitions(dto.rules);
    validateRuleConflicts(dto.rules);
    validateConstructionStandards(dto.constructionStandards);
    await this.assertConstructionReferences(dto.storeId, dto.positionCostRateVersionId, dto.constructionStandards);
    if (dto.effectiveTo && new Date(dto.effectiveTo) <= new Date(dto.effectiveFrom)) {
      throw new BadRequestException("规则生效结束时间必须晚于开始时间");
    }
    const existing = await this.prisma.pricingRuleSet.findFirst({
      where: { id, storeId: dto.storeId },
      select: { status: true, version: true }
    });
    if (!existing) throw new NotFoundException("价格规则版本不存在");
    if (existing.status !== PricingRuleSetStatus.DRAFT) {
      throw new BadRequestException("已发布或已停用的规则版本不可修改，请复制为新草稿");
    }
    const updated = await this.prisma.pricingRuleSet.update({
      where: { id },
      data: {
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        ...(dto.positionCostRateVersionId !== undefined ? { positionCostRateVersionId: dto.positionCostRateVersionId || null } : {}),
        rules: {
          deleteMany: {},
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
          upsert: {
            create: {
              normalDeviationBps: dto.protectionPolicy.normalDeviationBps,
              approvalDeviationBps: dto.protectionPolicy.approvalDeviationBps,
              minimumMarginBps: dto.protectionPolicy.minimumMarginBps,
              blockBelowMarginBps: dto.protectionPolicy.blockBelowMarginBps,
              softHoldHours: dto.protectionPolicy.softHoldHours ?? 24,
              allowSpecialApproval: dto.protectionPolicy.allowSpecialApproval ?? false,
              internalLaborCostConfig: dto.protectionPolicy.internalLaborCostConfig as Prisma.InputJsonValue
            },
            update: {
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
        ...(dto.constructionStandards !== undefined ? {
          constructionStandards: {
            deleteMany: {},
            create: createConstructionStandards(dto.constructionStandards)
          }
        } : {})
      },
      include: ruleSetInclude
    });
    await this.recordAudit({ action: "pricing_rule_draft_updated", actorId: actor.id, targetType: "PricingRuleSet", targetId: id, metadata: { storeId: dto.storeId, version: existing.version } });
    return updated;
  }

  async createDraft(user: PricingAuthenticatedUser, dto: CreatePricingRuleSetDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    validateProtectionPolicy(dto.protectionPolicy);
    validateRuleDefinitions(dto.rules);
    validateRuleConflicts(dto.rules);
    validateConstructionStandards(dto.constructionStandards);
    await this.assertConstructionReferences(dto.storeId, dto.positionCostRateVersionId, dto.constructionStandards);
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
        positionCostRateVersionId: dto.positionCostRateVersionId || undefined,
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
        },
        constructionStandards: { create: createConstructionStandards(dto.constructionStandards ?? []) }
      },
      include: ruleSetInclude
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
      include: ruleSetInclude
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
      include: ruleSetInclude
    });
    await this.recordAudit({ action: "pricing_rule_default_draft_created", actorId: actor.id, targetType: "PricingRuleSet", targetId: ruleSet.id, metadata: { storeId, version } });
    return { created: true, ruleSet };
  }

  async publish(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, storeId);
    const ruleSet = await this.prisma.pricingRuleSet.findFirst({
      where: { id, storeId },
      include: ruleSetInclude
    });
    if (!ruleSet) throw new NotFoundException("价格规则版本不存在");
    if (ruleSet.status !== PricingRuleSetStatus.DRAFT) {
      throw new BadRequestException("只有草稿规则版本可以发布");
    }
    if (!ruleSet.protectionPolicy) throw new BadRequestException("规则版本缺少保护策略");
    validateRuleDefinitions(ruleSet.rules.map((rule) => ({ ...rule, conditions: rule.conditions as never })) as never);
    validateRuleConflicts(ruleSet.rules);
    await this.assertPublishedConstructionReferences(storeId, ruleSet.positionCostRateVersionId, ruleSet.constructionStandards);

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
        include: ruleSetInclude
      });
    });
    await this.recordAudit({ action: "pricing_rule_published", actorId: actor.id, targetType: "PricingRuleSet", targetId: published.id, metadata: { storeId, version: published.version } });
    return published;
  }

  async validate(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, storeId);
    const ruleSet = await this.prisma.pricingRuleSet.findFirst({ where: { id, storeId }, include: ruleSetInclude });
    if (!ruleSet) throw new NotFoundException("价格规则版本不存在");
    const errors: string[] = [];
    if (!ruleSet.protectionPolicy) errors.push("缺少保护策略");
    try {
      validateRuleDefinitions(ruleSet.rules.map((rule) => ({ ...rule, conditions: rule.conditions as never })) as never);
      validateRuleConflicts(ruleSet.rules);
      await this.assertPublishedConstructionReferences(storeId, ruleSet.positionCostRateVersionId, ruleSet.constructionStandards);
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
    const retired = await this.prisma.pricingRuleSet.findUnique({ where: { id }, include: ruleSetInclude });
    await this.recordAudit({ action: "pricing_rule_retired", actorId: actor.id, targetType: "PricingRuleSet", targetId: id, metadata: { storeId } });
    return retired;
  }

  async copy(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, storeId);
    const source = await this.prisma.pricingRuleSet.findFirst({ where: { id, storeId }, include: ruleSetInclude });
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
        positionCostRateVersionId: source.positionCostRateVersionId,
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
        },
        constructionStandards: {
          create: source.constructionStandards.map((standard) => ({
            serviceItemId: standard.serviceItemId,
            vehiclePriceClassId: standard.vehiclePriceClassId ?? undefined,
            constructionLocationCode: standard.constructionLocationCode,
            productCategoryCode: standard.productCategoryCode ?? undefined,
            salesUnitCode: standard.salesUnitCode ?? undefined,
            quantityFrom: standard.quantityFrom ?? undefined,
            quantityTo: standard.quantityTo ?? undefined,
            baseConstructionChargeCents: standard.baseConstructionChargeCents,
            standardWorkMinutes: standard.standardWorkMinutes,
            addonChargeCents: standard.addonChargeCents,
            addonWorkMinutes: standard.addonWorkMinutes,
            standardCommissionCents: standard.standardCommissionCents,
            standardAllowanceCents: standard.standardAllowanceCents,
            priority: standard.priority,
            enabled: standard.enabled,
            crewRoles: { create: standard.crewRoles.map((role) => ({ positionTypeCode: role.positionTypeCode, workerCount: role.workerCount, workMinutes: role.workMinutes })) }
          }))
        }
      },
      include: ruleSetInclude
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
      include: ruleSetInclude
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

  private async assertConstructionReferences(
    storeId: string,
    positionCostRateVersionId?: string,
    standards?: CreatePricingRuleSetDto["constructionStandards"]
  ) {
    if (positionCostRateVersionId) {
      const rateVersion = await this.prisma.positionCostRateVersion.findFirst({ where: { id: positionCostRateVersionId, storeId } });
      if (!rateVersion) throw new BadRequestException("岗位小时成本版本不存在或不属于当前门店");
    }
    if (!standards?.length) return;
    const [serviceItems, vehicleClasses] = await Promise.all([
      this.prisma.constructionServiceItem.findMany({ where: { storeId, status: "ACTIVE" }, select: { id: true, serviceGroupCode: true } }),
      this.prisma.vehiclePriceClass.findMany({ where: { storeId, status: "ACTIVE" }, select: { id: true } })
    ]);
    const serviceIds = new Set(serviceItems.map((item) => item.id));
    const serviceGroupById = new Map(serviceItems.map((item) => [item.id, item.serviceGroupCode]));
    const vehicleIds = new Set(vehicleClasses.map((item) => item.id));
    for (const standard of standards) {
      if (!serviceIds.has(standard.serviceItemId)) throw new BadRequestException("施工标准引用的服务项目不存在或已停用");
      if (standard.vehiclePriceClassId && !vehicleIds.has(standard.vehiclePriceClassId)) throw new BadRequestException("施工标准引用的车辆价格级别不存在或已停用");
    }
    assertNoConstructionGroupConflict(standards, serviceGroupById);
  }

  private async assertPublishedConstructionReferences(
    storeId: string,
    positionCostRateVersionId: string | null,
    standards: Array<{ crewRoles: Array<{ positionTypeCode: string }> }>
  ) {
    if (!standards.length) return;
    if (!positionCostRateVersionId) throw new BadRequestException("施工标准已配置，必须绑定已发布岗位小时成本版本");
    const rateVersion = await this.prisma.positionCostRateVersion.findFirst({
      where: { id: positionCostRateVersionId, storeId, status: "PUBLISHED" },
      select: { rates: { select: { positionTypeCode: true } } }
    });
    if (!rateVersion) throw new BadRequestException("施工标准必须绑定已发布岗位小时成本版本");
    const positionCodes = new Set(rateVersion.rates.map((rate) => rate.positionTypeCode));
    const missing = standards.flatMap((standard) => standard.crewRoles).find((role) => !positionCodes.has(role.positionTypeCode));
    if (missing) throw new BadRequestException(`岗位小时成本版本缺少施工标准所需岗位：${missing.positionTypeCode}`);
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

export function validateRuleConflicts(rules: Array<{ group: string; target: string; priority?: number; conditions: unknown; enabled?: boolean }>) {
  const seen = new Set<string>();
  for (const rule of rules.filter((item) => item.enabled !== false)) {
    const key = `${rule.target}:${rule.group}:${canonicalConditions(rule.conditions)}`;
    if (seen.has(key)) throw new BadRequestException("同一适用条件不能配置多条价格调整，请合并或修改其中一条规则");
    seen.add(key);
  }
}

function validateConstructionStandards(standards?: CreatePricingRuleSetDto["constructionStandards"]) {
  if (!standards?.length) return;
  const seen = new Set<string>();
  for (const standard of standards) {
    if (standard.quantityFrom !== undefined && standard.quantityTo !== undefined && standard.quantityFrom > standard.quantityTo) {
      throw new BadRequestException("施工标准数量上限不能小于数量下限");
    }
    if (!standard.crewRoles.length) throw new BadRequestException("施工标准至少需要一个岗位工时");
    const roles = new Set<string>();
    for (const role of standard.crewRoles) {
      const code = role.positionTypeCode.trim();
      if (!code || roles.has(code)) throw new BadRequestException("同一施工标准的岗位工时不可重复");
      roles.add(code);
    }
    const key = [standard.serviceItemId, standard.vehiclePriceClassId ?? "*", standard.constructionLocationCode, standard.productCategoryCode ?? "*", standard.salesUnitCode ?? "*", standard.quantityFrom ?? "*", standard.quantityTo ?? "*"].join(":");
    if (seen.has(key)) throw new BadRequestException("相同适用范围不能配置多条施工标准，请合并或调整优先级");
    seen.add(key);
  }
}

function createConstructionStandards(standards: NonNullable<CreatePricingRuleSetDto["constructionStandards"]>) {
  return standards.map((standard) => ({
    serviceItemId: standard.serviceItemId,
    vehiclePriceClassId: standard.vehiclePriceClassId || undefined,
    constructionLocationCode: standard.constructionLocationCode.trim(),
    productCategoryCode: standard.productCategoryCode?.trim() || undefined,
    salesUnitCode: standard.salesUnitCode?.trim() || undefined,
    quantityFrom: standard.quantityFrom,
    quantityTo: standard.quantityTo,
    baseConstructionChargeCents: standard.baseConstructionChargeCents,
    standardWorkMinutes: standard.standardWorkMinutes,
    addonChargeCents: standard.addonChargeCents ?? 0,
    addonWorkMinutes: standard.addonWorkMinutes ?? 0,
    standardCommissionCents: standard.standardCommissionCents ?? 0,
    standardAllowanceCents: standard.standardAllowanceCents ?? 0,
    priority: standard.priority ?? 0,
    enabled: standard.enabled ?? true,
    crewRoles: { create: standard.crewRoles.map((role) => ({ positionTypeCode: role.positionTypeCode.trim(), workerCount: role.workerCount, workMinutes: role.workMinutes })) }
  }));
}

export function assertNoConstructionGroupConflict(
  standards: NonNullable<CreatePricingRuleSetDto["constructionStandards"]>,
  serviceGroupById: Map<string, string>
) {
  for (let index = 0; index < standards.length; index += 1) {
    for (let next = index + 1; next < standards.length; next += 1) {
      const left = standards[index];
      const right = standards[next];
      if (serviceGroupById.get(left.serviceItemId) !== serviceGroupById.get(right.serviceItemId)) continue;
      if (left.constructionLocationCode !== right.constructionLocationCode) continue;
      if (!valuesOverlap(left.vehiclePriceClassId, right.vehiclePriceClassId)) continue;
      if (!valuesOverlap(left.productCategoryCode, right.productCategoryCode)) continue;
      if (!valuesOverlap(left.salesUnitCode, right.salesUnitCode)) continue;
      if (!numberRangesOverlap(left.quantityFrom, left.quantityTo, right.quantityFrom, right.quantityTo)) continue;
      throw new BadRequestException("同一施工组的相同适用范围只能保留一条主标准：保留一条填写主项目收费和工时，将其他同组产品的费用与工时填入每个追加项目字段；数量分段时请使用互不重叠的区间");
    }
  }
}

function valuesOverlap(left?: string, right?: string) {
  return !left || !right || left === right;
}

function numberRangesOverlap(leftFrom?: number, leftTo?: number, rightFrom?: number, rightTo?: number) {
  const fromLeft = leftFrom ?? Number.NEGATIVE_INFINITY;
  const toLeft = leftTo ?? Number.POSITIVE_INFINITY;
  const fromRight = rightFrom ?? Number.NEGATIVE_INFINITY;
  const toRight = rightTo ?? Number.POSITIVE_INFINITY;
  return fromLeft <= toRight && fromRight <= toLeft;
}

function canonicalConditions(conditions: unknown) {
  if (!Array.isArray(conditions)) return JSON.stringify(conditions);
  const normalized = conditions.map((condition) => {
    if (!condition || typeof condition !== "object") return condition;
    const item = condition as { field?: unknown; operator?: unknown; value?: unknown };
    const value = item.operator === "IN" && Array.isArray(item.value)
      ? [...item.value].map(String).sort((left, right) => left.localeCompare(right, "zh-CN"))
      : item.value;
    return { field: item.field, operator: item.operator, value };
  });
  return JSON.stringify(normalized.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "zh-CN")));
}

export function validateRuleDefinitions(rules: CreatePricingRuleSetDto["rules"]) {
  const operators = new Set(["EQ", "IN", "BETWEEN", "GTE", "LTE"]);
  const fields = new Set(["productId", "productCategory", "productBrand", "productModel", "salesUnit", "quantity", "vehicleClassCode", "constructionType", "constructionLocation", "lineCount", "totalQuantity", "effectiveAt"]);
  const numericFields = new Set(["quantity", "lineCount", "totalQuantity"]);
  for (const rule of rules) {
    if (!rule.name.trim()) throw new BadRequestException("规则名称不能为空");
    if ((rule.actionType === "ADD_CENTS" || rule.actionType === "SUBTRACT_CENTS") && rule.actionValue < 0) {
      throw new BadRequestException("金额调整值不能为负数");
    }
    for (const condition of rule.conditions) {
      if (!condition.field.trim() || !fields.has(condition.field) || !operators.has(condition.operator)) {
        throw new BadRequestException("规则条件字段或运算符无效");
      }
      const numericField = numericFields.has(condition.field);
      if (!numericField && condition.operator !== "EQ" && condition.operator !== "IN") {
        throw new BadRequestException("车型、产品和施工等选择项只能使用“为”或“属于”");
      }
      if (numericField && condition.operator === "IN") {
        throw new BadRequestException("数量类条件只能使用“为、介于、不少于或不超过”");
      }
      if (condition.operator === "BETWEEN" && (!Array.isArray(condition.value) || condition.value.length !== 2)) {
        throw new BadRequestException("BETWEEN 条件必须提供两个边界值");
      }
      if (condition.operator === "IN" && (!Array.isArray(condition.value) || condition.value.length === 0)) {
        throw new BadRequestException("IN 条件至少需要一个候选值");
      }
      if ((condition.operator === "EQ" || condition.operator === "GTE" || condition.operator === "LTE") && String(condition.value ?? "").trim() === "") {
        throw new BadRequestException("规则条件值不能为空");
      }
      if (numericField && condition.operator === "BETWEEN" && (!Array.isArray(condition.value) || condition.value.some((value) => typeof value !== "number" || !Number.isFinite(value)))) {
        throw new BadRequestException("数量区间必须填写两个有效数字");
      }
      if (numericField && condition.operator !== "BETWEEN" && (typeof condition.value !== "number" || !Number.isFinite(condition.value))) {
        throw new BadRequestException("数量类条件必须填写数字");
      }
    }
    if ((rule.actionType === "DISCOUNT_BPS" || rule.actionType === "MULTIPLY_BPS") && (rule.actionValue > 10000 || rule.actionValue < -10000)) {
      throw new BadRequestException("基点调整值不能超过 10000");
    }
  }
}

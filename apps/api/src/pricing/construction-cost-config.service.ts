import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { DictionaryStatus, PositionCostRateVersionStatus, StorePosition } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService, type AuditEvent } from "../observability/audit-log.service";
import { AuditEventWriter } from "../observability/audit-event-writer";
import { persistAuditEvent } from "../observability/persist-audit-event";
import type { PricingAuthenticatedUser } from "./pricing.service";
import {
  CreateConstructionServiceItemDto,
  CreatePositionCostRateVersionDto,
  UpdateConstructionServiceItemDto,
  UpdatePositionCostRateVersionDto
} from "./dto/construction-cost-config.dto";

/** Master data and finance rate cards used by versioned construction standards. */
@Injectable()
export class ConstructionCostConfigService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditLogService, @Optional() private readonly auditWriter?: AuditEventWriter, private readonly accessContext?: AccessContext) {}

  async listServiceItems(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    await this.assertCanView(actor, storeId);
    return this.prisma.constructionServiceItem.findMany({ where: { storeId }, orderBy: [{ constructionTypeCode: "asc" }, { serviceGroupCode: "asc" }, { code: "asc" }] });
  }

  async createServiceItem(user: PricingAuthenticatedUser, dto: CreateConstructionServiceItemDto) {
    const actor = await this.withStoreMember(user);
    await this.assertCanManageBusiness(actor, dto.storeId);
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name.trim()) throw new BadRequestException("施工服务编码和名称不能为空");
    const item = await this.prisma.constructionServiceItem.create({
      data: {
        storeId: dto.storeId, code, name: dto.name.trim(),
        constructionTypeCode: dto.constructionTypeCode.trim(), serviceGroupCode: dto.serviceGroupCode.trim(),
        defaultProductCategoryCode: dto.defaultProductCategoryCode?.trim() || null
      }
    });
    await this.recordAudit({ action: "construction_service_item_created", actorId: actor.id, targetType: "ConstructionServiceItem", targetId: item.id, metadata: { storeId: dto.storeId, code } });
    return item;
  }

  async updateServiceItem(user: PricingAuthenticatedUser, id: string, dto: UpdateConstructionServiceItemDto) {
    const actor = await this.withStoreMember(user);
    await this.assertCanManageBusiness(actor, dto.storeId);
    const current = await this.prisma.constructionServiceItem.findFirst({ where: { id, storeId: dto.storeId } });
    if (!current) throw new NotFoundException("施工服务项目不存在");
    const item = await this.prisma.constructionServiceItem.update({
      where: { id }, data: {
        name: dto.name?.trim() || current.name,
        constructionTypeCode: dto.constructionTypeCode?.trim() || current.constructionTypeCode,
        serviceGroupCode: dto.serviceGroupCode?.trim() || current.serviceGroupCode,
        defaultProductCategoryCode: dto.defaultProductCategoryCode === undefined ? current.defaultProductCategoryCode : dto.defaultProductCategoryCode.trim() || null,
        status: dto.status ?? current.status
      }
    });
    await this.recordAudit({ action: "construction_service_item_updated", actorId: actor.id, targetType: "ConstructionServiceItem", targetId: id, metadata: { storeId: dto.storeId } });
    return item;
  }

  async listRateVersions(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    await this.assertCanViewCost(actor, storeId);
    const versions = await this.prisma.positionCostRateVersion.findMany({ where: { storeId }, include: { rates: { orderBy: { positionTypeCode: "asc" } } }, orderBy: { version: "desc" } });
    // 店长需要选择已发布版本以编制施工标准，但岗位小时成本金额属于财务成本口径。
    // 非财务仍需知道版本是否已配置，避免空白列表被误判为成本丢失。
    const versionsWithRateCount = versions.map(({ rates, ...version }) => ({
      ...version,
      rates,
      rateCount: rates.length
    }));
    if (await this.canViewRateDetails(actor, storeId)) return versionsWithRateCount;
    return versionsWithRateCount.map(({ rates: _rates, ...version }) => ({ ...version, rates: [] }));
  }

  async createRateVersion(user: PricingAuthenticatedUser, dto: CreatePositionCostRateVersionDto) {
    const actor = await this.withStoreMember(user);
    await this.assertCanManageCost(actor, dto.storeId);
    validateRates(dto.rates);
    validateDateRange(dto.effectiveFrom, dto.effectiveTo);
    const version = await this.nextRateVersion(dto.storeId);
    const rateVersion = await this.prisma.positionCostRateVersion.create({
      data: {
        storeId: dto.storeId, version, status: PositionCostRateVersionStatus.DRAFT,
        effectiveFrom: new Date(dto.effectiveFrom), effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        createdById: actor.id,
        rates: { create: dto.rates.map((rate) => ({ positionTypeCode: rate.positionTypeCode.trim(), hourlyCostCents: rate.hourlyCostCents })) }
      }, include: { rates: true }
    });
    await this.recordAudit({ action: "position_cost_rate_version_created", actorId: actor.id, targetType: "PositionCostRateVersion", targetId: rateVersion.id, metadata: { storeId: dto.storeId, version } });
    return rateVersion;
  }

  async updateRateVersion(user: PricingAuthenticatedUser, id: string, dto: UpdatePositionCostRateVersionDto) {
    const actor = await this.withStoreMember(user);
    await this.assertCanManageCost(actor, dto.storeId);
    validateRates(dto.rates);
    validateDateRange(dto.effectiveFrom, dto.effectiveTo);
    const current = await this.prisma.positionCostRateVersion.findFirst({ where: { id, storeId: dto.storeId } });
    if (!current) throw new NotFoundException("岗位小时成本版本不存在");
    if (current.status !== PositionCostRateVersionStatus.DRAFT) throw new BadRequestException("已发布岗位小时成本版本不可修改，请创建新草稿");
    const rateVersion = await this.prisma.positionCostRateVersion.update({
      where: { id }, data: {
        effectiveFrom: new Date(dto.effectiveFrom), effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        rates: { deleteMany: {}, create: dto.rates.map((rate) => ({ positionTypeCode: rate.positionTypeCode.trim(), hourlyCostCents: rate.hourlyCostCents })) }
      }, include: { rates: true }
    });
    await this.recordAudit({ action: "position_cost_rate_version_updated", actorId: actor.id, targetType: "PositionCostRateVersion", targetId: id, metadata: { storeId: dto.storeId } });
    return rateVersion;
  }

  async publishRateVersion(user: PricingAuthenticatedUser, storeId: string, id: string) {
    const actor = await this.withStoreMember(user);
    await this.assertCanManageCost(actor, storeId);
    const version = await this.prisma.positionCostRateVersion.findFirst({ where: { id, storeId }, include: { rates: true } });
    if (!version) throw new NotFoundException("岗位小时成本版本不存在");
    if (version.status !== PositionCostRateVersionStatus.DRAFT) throw new BadRequestException("只有草稿岗位小时成本版本可以发布");
    validateRates(version.rates);
    const published = await this.prisma.$transaction(async (tx) => {
      if (version.effectiveFrom <= new Date()) {
        await tx.positionCostRateVersion.updateMany({ where: { storeId, status: PositionCostRateVersionStatus.PUBLISHED, id: { not: id } }, data: { status: PositionCostRateVersionStatus.RETIRED } });
      }
      return tx.positionCostRateVersion.update({ where: { id }, data: { status: PositionCostRateVersionStatus.PUBLISHED, publishedById: actor.id, publishedAt: new Date() }, include: { rates: true } });
    });
    await this.recordAudit({ action: "position_cost_rate_version_published", actorId: actor.id, targetType: "PositionCostRateVersion", targetId: id, metadata: { storeId, version: published.version } });
    return published;
  }

  private async nextRateVersion(storeId: string) {
    const latest = await this.prisma.positionCostRateVersion.findFirst({ where: { storeId }, orderBy: { version: "desc" }, select: { version: true } });
    return (latest?.version ?? 0) + 1;
  }

  private async assertCanView(user: UserWithStoreMember, storeId: string) {
    if (!this.accessContext || !await this.accessContext.can(user.id, "products", "read", { storeId })) throw new ForbiddenException("无权限");
  }

  private async assertCanManageBusiness(user: UserWithStoreMember, storeId: string) {
    if (!this.accessContext || !await this.accessContext.can(user.id, "store", "write", { storeId })) throw new ForbiddenException("只有店长可以维护施工服务项目");
  }

  private async assertCanViewCost(user: UserWithStoreMember, storeId: string) {
    if (!this.accessContext || !await this.accessContext.can(user.id, "finance", "write", { storeId })) throw new ForbiddenException("无权限查看内部成本");
  }

  private async assertCanManageCost(user: UserWithStoreMember, storeId: string) {
    if (!await this.canViewRateDetails(user, storeId)) throw new ForbiddenException("只有财务可以维护岗位小时成本");
  }

  private async canViewRateDetails(user: UserWithStoreMember, storeId: string) {
    if (!this.accessContext || !await this.accessContext.can(user.id, "finance", "write", { storeId })) return false;
    const resolution = await this.accessContext.resolve(user.id, { storeId });
    return resolution.roles.some((role) => ["FINANCE", "HQ_ADMIN", "AUDITOR"].includes(role.roleCode));
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async recordAudit(event: AuditEvent) {
    if (this.auditWriter) return this.auditWriter.writeTransactional(this.prisma, event);
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

function validateRates(rates: Array<{ positionTypeCode: string; hourlyCostCents: number }>) {
  if (!rates.length) throw new BadRequestException("至少维护一个岗位小时成本");
  const seen = new Set<string>();
  for (const rate of rates) {
    const code = rate.positionTypeCode.trim();
    if (!code) throw new BadRequestException("岗位编码不能为空");
    if (!Number.isInteger(rate.hourlyCostCents) || rate.hourlyCostCents < 0) throw new BadRequestException("岗位小时成本必须是非负整数分");
    if (seen.has(code)) throw new BadRequestException(`岗位小时成本重复：${code}`);
    seen.add(code);
  }
}

function validateDateRange(from: string, to?: string) {
  if (to && new Date(to) <= new Date(from)) throw new BadRequestException("成本版本结束时间必须晚于开始时间");
}

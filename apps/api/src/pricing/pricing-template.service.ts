import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, PricingTemplateStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { PricingRulesService } from "./pricing-rules.service";
import { CopyPricingTemplateDto, CreatePricingTemplateDto, CreatePricingTemplateVersionDto } from "./dto/pricing-template.dto";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class PricingTemplateService {
  constructor(private readonly prisma: PrismaService, private readonly pricingRules: PricingRulesService, @Optional() private readonly audit?: AuditLogService) {}

  async list(user: PricingAuthenticatedUser) {
    const actor = await this.withStoreMember(user);
    this.assertAdmin(actor);
    return this.prisma.pricingRuleTemplate.findMany({ orderBy: { updatedAt: "desc" }, include: { versions: { orderBy: { version: "desc" } } } });
  }

  async create(user: PricingAuthenticatedUser, dto: CreatePricingTemplateDto) {
    const actor = await this.withStoreMember(user);
    this.assertAdmin(actor);
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name.trim()) throw new BadRequestException("模板编码和名称不能为空");
    const template = await this.prisma.pricingRuleTemplate.create({ data: { code, name: dto.name.trim(), description: dto.description?.trim(), createdById: actor.id } });
    await this.recordAudit({ action: "pricing_template_created", actorId: actor.id, targetType: "PricingRuleTemplate", targetId: template.id, metadata: { code } });
    return template;
  }

  async createVersion(user: PricingAuthenticatedUser, templateId: string, dto: CreatePricingTemplateVersionDto) {
    const actor = await this.withStoreMember(user);
    this.assertAdmin(actor);
    const template = await this.prisma.pricingRuleTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException("模板不存在");
    const latest = await this.prisma.pricingRuleTemplateVersion.findFirst({ where: { templateId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = await this.prisma.pricingRuleTemplateVersion.create({
      data: {
        templateId,
        version: (latest?.version ?? 0) + 1,
        rules: dto.rules as unknown as Prisma.InputJsonValue,
        protectionPolicy: dto.protectionPolicy as unknown as Prisma.InputJsonValue,
        createdById: actor.id
      }
    });
    await this.recordAudit({ action: "pricing_template_version_created", actorId: actor.id, targetType: "PricingRuleTemplateVersion", targetId: version.id, metadata: { templateId, version: version.version } });
    return version;
  }

  async publishVersion(user: PricingAuthenticatedUser, templateId: string, versionId: string) {
    const actor = await this.withStoreMember(user);
    this.assertAdmin(actor);
    const version = await this.prisma.pricingRuleTemplateVersion.findFirst({ where: { id: versionId, templateId } });
    if (!version) throw new NotFoundException("模板版本不存在");
    await this.prisma.pricingRuleTemplate.update({ where: { id: templateId }, data: { status: PricingTemplateStatus.PUBLISHED } });
    const published = await this.prisma.pricingRuleTemplateVersion.update({ where: { id: versionId }, data: { publishedById: actor.id, publishedAt: new Date() } });
    await this.recordAudit({ action: "pricing_template_version_published", actorId: actor.id, targetType: "PricingRuleTemplateVersion", targetId: versionId, metadata: { templateId, version: published.version } });
    return published;
  }

  async copyToStore(user: PricingAuthenticatedUser, templateId: string, versionId: string, dto: CopyPricingTemplateDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageProduct(actor, dto.storeId)) throw new ForbiddenException("无权限复制总部模板");
    const version = await this.prisma.pricingRuleTemplateVersion.findFirst({ where: { id: versionId, templateId, publishedAt: { not: null } }, include: { template: true } });
    if (!version) throw new NotFoundException("模板发布版本不存在");
    const copied = await this.pricingRules.createDraft(user, {
      storeId: dto.storeId,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      rules: version.rules as never,
      protectionPolicy: version.protectionPolicy as never
    });
    await this.recordAudit({ action: "pricing_template_copied_to_store", actorId: actor.id, targetType: "PricingRuleTemplateVersion", targetId: versionId, metadata: { templateId, storeId: dto.storeId, createdRuleSetId: copied.id } });
    return copied;
  }

  private assertAdmin(user: UserWithStoreMember) {
    if (!PermissionPolicy.isAdmin(user)) throw new ForbiddenException("只有平台管理员可以维护总部模板");
  }

  private async recordAudit(event: AuditEvent) {
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

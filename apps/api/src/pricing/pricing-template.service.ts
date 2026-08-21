import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, PricingTemplateStatus } from "@prisma/client";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { PricingRulesService } from "./pricing-rules.service";
import { CopyPricingTemplateDto, CreatePricingTemplateDto, CreatePricingTemplateVersionDto } from "./dto/pricing-template.dto";
import { AuditLogService } from "../observability/audit-log.service";
import { AuditEventWriter } from "../observability/audit-event-writer";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class PricingTemplateService {
  constructor(private readonly prisma: PrismaService, private readonly pricingRules: PricingRulesService, @Optional() private readonly audit?: AuditLogService, @Optional() private readonly auditWriter?: AuditEventWriter, private readonly accessContext?: AccessContext) {}

  async list(user: PricingAuthenticatedUser) {
    const actor = this.subject(user);
    await this.assertAdmin(actor);
    return this.prisma.pricingRuleTemplate.findMany({ orderBy: { updatedAt: "desc" }, include: { versions: { orderBy: { version: "desc" } } } });
  }

  async create(user: PricingAuthenticatedUser, dto: CreatePricingTemplateDto) {
    const actor = this.subject(user);
    await this.assertAdmin(actor);
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name.trim()) throw new BadRequestException("模板编码和名称不能为空");
    const template = await this.prisma.pricingRuleTemplate.create({ data: { code, name: dto.name.trim(), description: dto.description?.trim(), createdById: actor.userId } });
    await this.recordAudit({ action: "pricing_template_created", actorId: actor.userId, targetType: "PricingRuleTemplate", targetId: template.id, metadata: { code } });
    return template;
  }

  async createVersion(user: PricingAuthenticatedUser, templateId: string, dto: CreatePricingTemplateVersionDto) {
    const actor = this.subject(user);
    await this.assertAdmin(actor);
    const template = await this.prisma.pricingRuleTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException("模板不存在");
    const latest = await this.prisma.pricingRuleTemplateVersion.findFirst({ where: { templateId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = await this.prisma.pricingRuleTemplateVersion.create({
      data: {
        templateId,
        version: (latest?.version ?? 0) + 1,
        rules: dto.rules as unknown as Prisma.InputJsonValue,
        protectionPolicy: dto.protectionPolicy as unknown as Prisma.InputJsonValue,
        createdById: actor.userId
      }
    });
    await this.recordAudit({ action: "pricing_template_version_created", actorId: actor.userId, targetType: "PricingRuleTemplateVersion", targetId: version.id, metadata: { templateId, version: version.version } });
    return version;
  }

  async publishVersion(user: PricingAuthenticatedUser, templateId: string, versionId: string) {
    const actor = this.subject(user);
    this.assertAdmin(actor);
    const version = await this.prisma.pricingRuleTemplateVersion.findFirst({ where: { id: versionId, templateId } });
    if (!version) throw new NotFoundException("模板版本不存在");
    await this.prisma.pricingRuleTemplate.update({ where: { id: templateId }, data: { status: PricingTemplateStatus.PUBLISHED } });
    const published = await this.prisma.pricingRuleTemplateVersion.update({ where: { id: versionId }, data: { publishedById: actor.userId, publishedAt: new Date() } });
    await this.recordAudit({ action: "pricing_template_version_published", actorId: actor.userId, targetType: "PricingRuleTemplateVersion", targetId: versionId, metadata: { templateId, version: published.version } });
    return published;
  }

  async copyToStore(user: PricingAuthenticatedUser, templateId: string, versionId: string, dto: CopyPricingTemplateDto) {
    const actor = this.subject(user);
    if (!this.accessContext || !await this.accessContext.can(actor, "products", "write", { storeId: dto.storeId })) throw new ForbiddenException("无权限复制总部模板");
    const version = await this.prisma.pricingRuleTemplateVersion.findFirst({ where: { id: versionId, templateId, publishedAt: { not: null } }, include: { template: true } });
    if (!version) throw new NotFoundException("模板发布版本不存在");
    const copied = await this.pricingRules.createDraft(user, {
      storeId: dto.storeId,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      rules: version.rules as never,
      protectionPolicy: version.protectionPolicy as never
    });
    await this.recordAudit({ action: "pricing_template_copied_to_store", actorId: actor.userId, targetType: "PricingRuleTemplateVersion", targetId: versionId, metadata: { templateId, storeId: dto.storeId, createdRuleSetId: copied.id } });
    return copied;
  }

  private async assertAdmin(user: AccessSubject) {
    if (!this.accessContext) throw new Error("PricingTemplateService access context is not configured");
    if (!await this.accessContext.can(user, "pricing.template", "write")) throw new ForbiddenException("只有平台管理员可以维护总部模板");
  }

  private async recordAudit(event: AuditEvent) {
    if (this.auditWriter) return this.auditWriter.writeTransactional(this.prisma, event);
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }

  private subject(user: PricingAuthenticatedUser): AccessSubject {
    return { userId: user.id };
  }
}

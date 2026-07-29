import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DictionaryStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedSettingsUser } from "./dictionaries.service";
import { CreateDictionaryTemplateDto, CreateDictionaryTemplateItemDto, SetDictionaryTemplateItemStatusDto, UpdateDictionaryTemplateDto, UpdateDictionaryTemplateItemDto } from "./dto/dictionary-template.dto";

@Injectable()
export class DictionaryTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertHq(user: AuthenticatedSettingsUser) {
    if (!user.isAuditor) throw new ForbiddenException("仅总部管理员可维护总部字典模板");
    return user;
  }

  private serialize(template: Prisma.DictionaryTemplateGetPayload<{ include: { templateItems: true } }>) {
    const items = [...template.templateItems].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    return {
      ...template,
      storeId: null,
      source: "HQ_TEMPLATE" as const,
      items: items.map((item) => item.name),
      dictionaryItems: items.map((item) => ({ ...item, source: "HQ_TEMPLATE" as const, isSystem: false, referencedCount: item.usageCount, deletePolicy: "DISABLE_ONLY" as const }))
    };
  }

  async list(user: AuthenticatedSettingsUser) {
    this.assertHq(user);
    const rows = await this.prisma.dictionaryTemplate.findMany({ orderBy: { createdAt: "asc" }, include: { templateItems: true } });
    return rows.map((row) => this.serialize(row));
  }

  async create(user: AuthenticatedSettingsUser, dto: CreateDictionaryTemplateDto) {
    const actor = this.assertHq(user);
    const code = dto.code.trim().toUpperCase();
    const duplicate = await this.prisma.dictionaryTemplate.findUnique({ where: { code } });
    if (duplicate) throw new ConflictException("总部模板编码已存在，请更换编码");
    const items = dto.items.map((item, index) => ({ code: item.code.trim(), name: item.name.trim(), sortOrder: item.sortOrder ?? index, parentId: item.parentId ?? null }));
    if (items.some((item) => !item.code || !item.name)) throw new BadRequestException("模板项编码和名称不能为空");
    if (new Set(items.map((item) => item.code)).size !== items.length) throw new ConflictException("模板包含重复编码，整批未保存");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.dictionaryTemplate.create({ data: { code, name: dto.name.trim(), items: items.map((item) => item.name), status: dto.status ?? DictionaryStatus.ACTIVE, allowDisableItems: dto.allowDisableItems ?? true, allowHierarchy: dto.allowHierarchy ?? false, updatedById: actor.id, templateItems: { create: items.map((item) => ({ code: item.code, name: item.name, sortOrder: item.sortOrder, parentId: item.parentId })) } }, include: { templateItems: true } });
      await tx.auditEvent.create({ data: { action: "settings.dictionary.template.created", actorId: actor.id, storeId: null, targetType: "DictionaryTemplate", targetId: row.id, metadata: { code: row.code, source: "HQ_TEMPLATE" } } });
      return this.serialize(row);
    });
  }

  async update(user: AuthenticatedSettingsUser, id: string, dto: UpdateDictionaryTemplateDto) {
    const actor = this.assertHq(user);
    const current = await this.prisma.dictionaryTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("总部字典模板不存在");
    if (dto.version !== undefined && dto.version !== current.version) throw new ConflictException("总部模板已被其他人修改，请刷新后重试");
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dictionaryTemplate.update({ where: { id }, data: { ...(dto.name === undefined ? {} : { name: dto.name.trim() }), ...(dto.status === undefined ? {} : { status: dto.status }), ...(dto.allowDisableItems === undefined ? {} : { allowDisableItems: dto.allowDisableItems }), ...(dto.allowHierarchy === undefined ? {} : { allowHierarchy: dto.allowHierarchy }), version: { increment: 1 }, updatedById: actor.id }, include: { templateItems: true } });
      await tx.auditEvent.create({ data: { action: dto.status === DictionaryStatus.INACTIVE ? "settings.dictionary.template.disabled" : "settings.dictionary.template.updated", actorId: actor.id, storeId: null, targetType: "DictionaryTemplate", targetId: id, metadata: { before: { version: current.version, status: current.status }, after: { version: updated.version, status: updated.status } } } });
      return updated;
    });
    return this.serialize(row);
  }

  async createItem(user: AuthenticatedSettingsUser, templateId: string, dto: CreateDictionaryTemplateItemDto) {
    const actor = this.assertHq(user);
    const template = await this.prisma.dictionaryTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException("总部字典模板不存在");
    if (!template.allowHierarchy && dto.parentId) throw new BadRequestException("当前模板不支持层级");
    const code = dto.code.trim();
    const duplicate = await this.prisma.dictionaryTemplateItem.findUnique({ where: { templateId_code: { templateId, code } } });
    if (duplicate) throw new ConflictException("编码已存在，请更换编码");
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.dictionaryTemplateItem.create({ data: { templateId, code, name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0, parentId: dto.parentId ?? null, updatedById: actor.id } });
      await tx.dictionaryTemplate.update({ where: { id: templateId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: "settings.dictionary.template.item.created", actorId: actor.id, storeId: null, targetType: "DictionaryTemplateItem", targetId: item.id, metadata: { code: item.code, source: "HQ_TEMPLATE" } } });
      return { ...item, source: "HQ_TEMPLATE" as const, isSystem: false };
    });
  }

  async updateItem(user: AuthenticatedSettingsUser, itemId: string, dto: UpdateDictionaryTemplateItemDto) {
    const actor = this.assertHq(user);
    const item = await this.prisma.dictionaryTemplateItem.findUnique({ where: { id: itemId }, include: { template: true } });
    if (!item) throw new NotFoundException("总部模板字典项不存在");
    if (dto.version !== undefined && dto.version !== item.template.version) throw new ConflictException("总部模板已被其他人修改，请刷新后重试");
    if (dto.parentId && !item.template.allowHierarchy) throw new BadRequestException("当前模板不支持层级");
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dictionaryTemplateItem.update({ where: { id: itemId }, data: { ...(dto.name === undefined ? {} : { name: dto.name.trim() }), ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }), ...(dto.parentId === undefined ? {} : { parentId: dto.parentId }), updatedById: actor.id } });
      await tx.dictionaryTemplate.update({ where: { id: item.templateId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: "settings.dictionary.template.item.updated", actorId: actor.id, storeId: null, targetType: "DictionaryTemplateItem", targetId: itemId, metadata: { before: { name: item.name, sortOrder: item.sortOrder }, after: { name: row.name, sortOrder: row.sortOrder } } } });
      return row;
    });
    return { ...updated, source: "HQ_TEMPLATE" as const, isSystem: false };
  }
  async updateItemStatus(user: AuthenticatedSettingsUser, itemId: string, dto: SetDictionaryTemplateItemStatusDto) {
    const actor = this.assertHq(user);
    const item = await this.prisma.dictionaryTemplateItem.findUnique({ where: { id: itemId }, include: { template: true } });
    if (!item) throw new NotFoundException("总部模板字典项不存在");
    if (dto.status === DictionaryStatus.INACTIVE && !dto.reason?.trim()) throw new BadRequestException("停用字典项必须填写原因");
    if (!item.template.allowDisableItems && dto.status === DictionaryStatus.INACTIVE) throw new BadRequestException("当前模板不允许禁用字典项");
    if (dto.version !== undefined && dto.version !== item.template.version) throw new ConflictException("总部模板已被其他人修改，请刷新后重试");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dictionaryTemplateItem.update({ where: { id: itemId }, data: { status: dto.status, disabledReason: dto.reason?.trim() || null, updatedById: actor.id } });
      await tx.dictionaryTemplate.update({ where: { id: item.templateId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: dto.status === DictionaryStatus.INACTIVE ? "settings.dictionary.template.item.disabled" : "settings.dictionary.template.item.enabled", actorId: actor.id, storeId: null, targetType: "DictionaryTemplateItem", targetId: itemId, metadata: { before: { status: item.status }, after: { status: updated.status }, reason: dto.reason } } });
      return { ...updated, source: "HQ_TEMPLATE" as const, isSystem: false };
    });
  }
}
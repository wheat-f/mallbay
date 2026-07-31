import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DictionaryMode, DictionaryStatus, Prisma } from "@prisma/client";
import type { UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";
import { CreateDictionaryDto, CreateDictionaryItemDto, UpdateDictionaryDto, UpdateDictionaryItemDto, DictionaryCatalogQueryDto, DictionaryItemsQueryDto } from "./dto/dictionary.dto";
import { normalizePagination } from "../common/pagination";

type DefaultDictionaryDefinition = {
  name: string;
  code: string;
  items: readonly string[];
  itemCodes?: readonly string[];
};

export const VEHICLE_TYPE_CODES = ["SMALL_CAR", "STANDARD_CAR", "LUXURY_LARGE_CAR"] as const;

const DEFAULT_DICTIONARIES: readonly DefaultDictionaryDefinition[] = [
  { name: "施工类型", code: "CONSTRUCTION_TYPE", items: ["漆面保护膜", "改色膜", "隔热膜", "改装", "检查"], itemCodes: ["PPF", "COLOR_FILM", "HEAT_FILM", "MODIFICATION", "INSPECTION"] },
  { name: "施工地点", code: "CONSTRUCTION_LOCATION", items: ["到店", "外出"], itemCodes: ["IN_STORE", "OUTSIDE"] },
  { name: "施工岗位类型", code: "CONSTRUCTION_POSITION_TYPE", items: ["施工师傅", "施工学徒"], itemCodes: ["CONSTRUCTION", "APPRENTICE"] },
  { name: "请假类型", code: "LEAVE_TYPE", items: ["事假", "病假", "调休", "其他"], itemCodes: ["PERSONAL", "SICK", "COMP_TIME", "OTHER"] },
  { name: "工时偏差原因", code: "CONSTRUCTION_TIME_VARIANCE_REASON", items: ["客户临时追加", "车辆实际状况", "返工处理", "外出等待", "其他"], itemCodes: ["CUSTOMER_ADDON", "VEHICLE_CONDITION", "REWORK", "OUTSIDE_WAITING", "OTHER"] },
  { name: "成本调整原因", code: "CONSTRUCTION_COST_ADJUSTMENT_REASON", items: ["外包费用", "返工人工", "额外补贴", "提成修正", "其他"], itemCodes: ["OUTSOURCING", "REWORK_LABOR", "ALLOWANCE", "COMMISSION", "OTHER"] },
  { name: "成本异常原因", code: "CONSTRUCTION_COST_EXCEPTION_REASON", items: ["实际成本超预计", "实际毛利低于底线", "材料成本缺失", "工时偏差", "其他"], itemCodes: ["ACTUAL_COST_OVER_ESTIMATE", "ACTUAL_MARGIN_BELOW_THRESHOLD", "MATERIAL_COST_MISSING", "TIME_VARIANCE", "OTHER"] },
  { name: "施工补贴类型", code: "CONSTRUCTION_ALLOWANCE_TYPE", items: ["外出补贴", "夜间补贴", "高难度补贴", "其他"], itemCodes: ["OUTSIDE", "NIGHT", "COMPLEXITY", "OTHER"] },
  { name: "线索来源", code: "LEAD_SOURCE", items: ["抖音", "小红书", "快手", "门店", "转介绍", "合作伙伴", "其他"] },
  { name: "客户类型", code: "CUSTOMER_TYPE", items: ["个人客户", "企业客户"] },
  { name: "性别", code: "GENDER", items: ["男", "女", "未知"] },
  { name: "产品分类", code: "PRODUCT_CATEGORY", items: ["漆面保护膜", "改色膜", "隔热膜", "改装", "其他"], itemCodes: ["PPF", "COLOR_FILM", "HEAT_FILM", "MODIFICATION", "OTHER"] },
  { name: "产品单位", code: "PRODUCT_UNIT", items: ["卷", "米", "平方米", "平方厘米", "件"], itemCodes: ["ROLL", "METER", "SQUARE_METER", "SQUARE_CENTIMETER", "PIECE"] },
  { name: "车辆类型", code: "VEHICLE_TYPE", items: ["小车", "常规车", "豪车/大车"], itemCodes: VEHICLE_TYPE_CODES },
  { name: "质保周期", code: "WARRANTY_PERIOD", items: ["3年", "5年", "10年"] },
  { name: "付款类型", code: "PAYMENT_TYPE", items: ["定金", "尾款", "全款"] },
  { name: "收款账户类型", code: "PAYMENT_ACCOUNT_TYPE", items: ["对公账户", "个人账户", "微信", "支付宝", "其他"] },
  { name: "质检结果", code: "QUALITY_CHECK_RESULT", items: ["通过", "需要返工"] },
  { name: "售后责任", code: "AFTER_SALE_RESPONSIBILITY", items: ["客户人为损坏", "施工方责任", "原厂产品质量", "门店服务责任"] },
  { name: "费用申请类型", code: "FINANCE_APPLICATION_TYPE", items: ["费用申请", "报销申请"] },
  { name: "财务附件类别", code: "FINANCE_ATTACHMENT_CATEGORY", items: ["发票", "合同", "付款凭证", "其他"] },
  { name: "价格改价原因", code: "PRICE_ADJUSTMENT_REASON", items: ["客户议价", "活动优惠", "竞品价格", "特殊车型", "店长特批", "其他"] },
  { name: "报价驳回原因", code: "QUOTE_REJECTION_REASON", items: ["保护价过低", "毛利不足", "理由不充分", "信息不完整", "其他"] },
  { name: "价格规则标签", code: "PRICING_RULE_TAG", items: ["产品", "车辆", "施工", "套餐", "附加费"] },
  { name: "容量释放原因", code: "CAPACITY_HOLD_RELEASE_REASON", items: ["审批驳回", "销售撤回", "超时", "预约变更", "其他"] }
] as const;

const FIXED_DICTIONARY_CODES = new Set([
  "CONSTRUCTION_TYPE",
  "CONSTRUCTION_LOCATION",
  "CONSTRUCTION_POSITION_TYPE",
  "CONSTRUCTION_TIME_VARIANCE_REASON",
  "CONSTRUCTION_COST_ADJUSTMENT_REASON",
  "CONSTRUCTION_COST_EXCEPTION_REASON",
  "CONSTRUCTION_ALLOWANCE_TYPE",
  "PRODUCT_CATEGORY",
  "PRODUCT_UNIT",
  "VEHICLE_TYPE"
]);

export type AuthenticatedSettingsUser = UserWithStoreMember & { username?: string };

@Injectable()
export class DictionariesService {
  private readonly listCache = new Map<string, { expiresAt: number; value: any }>();

  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionsService) {}

  private async actor(user: AuthenticatedSettingsUser) {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async assertManager(user: AuthenticatedSettingsUser, storeId: string) {
    const actor = await this.actor(user);
    // Legacy position !== "MANAGER" guard is now represented by the published settings.write permission.
    if (!(await this.permissions.authorize(actor.id, "settings", "write", { storeId }))) {
      throw new ForbiddenException("仅当前门店店长可维护门店基础字典");
    }
    return actor;
  }

  private async assertStoreReader(user: AuthenticatedSettingsUser, storeId: string) {
    const actor = await this.actor(user);
    if (await this.permissions.authorize(actor.id, "settings", "read", { storeId })) return actor;
    if (!actor.storeMember || actor.storeMember.storeId !== storeId) {
      throw new ForbiddenException("无权读取其他门店的基础字典");
    }
    return actor;
  }
  private async recordAudit(actorId: string, action: string, targetId: string, storeId: string, metadata: Record<string, unknown> = {}) {
    await this.prisma.auditEvent.create({ data: { action, actorId, storeId, targetType: "Dictionary", targetId, metadata: metadata as Prisma.InputJsonValue } });
  }
  private async recordFailure(actorId: string, action: string, targetId: string, storeId: string, message: string, metadata: Record<string, unknown> = {}) {
    try { await this.prisma.auditEvent.create({ data: { action: `${action}.failed`, actorId, storeId, targetType: "Dictionary", targetId, metadata: { result: "FAILED", message, ...metadata } as Prisma.InputJsonValue } }); } catch { /* preserve the original operation error */ }
  }
  private serialize(dictionary: Prisma.DictionaryGetPayload<{ include: { dictionaryItems: true } }>) {
    const normalizedItems = dictionary.dictionaryItems
      .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
    return {
      ...dictionary,
      items: normalizedItems.length > 0
        ? normalizedItems.map((item) => item.name)
        : Array.isArray(dictionary.items) ? dictionary.items.filter((item): item is string => typeof item === "string") : [],
      dictionaryItems: normalizedItems.map((item) => ({ ...item, referencedCount: item.usageCount, deletePolicy: item.isSystem || item.source !== "STORE" || item.usageCount > 0 ? "DISABLE_ONLY" : "DELETE_OR_DISABLE" }))
    };
  }

  private serializeTemplate(template: Prisma.DictionaryTemplateGetPayload<{ include: { templateItems: true } }>, readOnly = true) {
    const items = [...template.templateItems].sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
    return { ...template, storeId: null, source: "HQ_TEMPLATE" as const, inherited: true, readOnly, items: items.map((item) => item.name), dictionaryItems: items.map((item) => ({ ...item, source: "HQ_TEMPLATE" as const, isSystem: false, referencedCount: item.usageCount, deletePolicy: "DISABLE_ONLY" as const })) };
  }
  private async ensureDefaults(storeId: string) {
    const result = { created: 0, skipped: 0, failed: [] as Array<{ code: string; name: string; reason: string }> };
    for (const item of DEFAULT_DICTIONARIES) {
      try {
        const existing = await this.prisma.dictionary.findUnique({ where: { storeId_code: { storeId, code: item.code } } });
        const dictionary = await this.prisma.dictionary.upsert({
          where: { storeId_code: { storeId, code: item.code } },
          create: { storeId, name: item.name, code: item.code, items: [...item.items], source: FIXED_DICTIONARY_CODES.has(item.code) ? "SYSTEM" : "STORE", allowCustomItems: !FIXED_DICTIONARY_CODES.has(item.code), allowDisableItems: true },
          update: {}
        });
        if (existing) result.skipped += 1; else result.created += 1;
        if (!existing || FIXED_DICTIONARY_CODES.has(item.code)) {
          await this.syncItems(dictionary.id, item.items, FIXED_DICTIONARY_CODES.has(item.code), item.itemCodes);
        }
      } catch (error) {
        result.failed.push({ code: item.code, name: item.name, reason: error instanceof Error ? error.message : "默认字典初始化失败" });
      }
    }
    return result;
  }

  async list(user: AuthenticatedSettingsUser, storeId?: string) {
    const actor = await this.actor(user);
    if (await this.permissions.authorize(actor.id, "settings", "read") && !storeId) {
      const [rows, templates] = await Promise.all([
        this.prisma.dictionary.findMany({ orderBy: { createdAt: "asc" }, include: { dictionaryItems: true } }),
        this.prisma.dictionaryTemplate.findMany({ orderBy: { createdAt: "asc" }, include: { templateItems: true } })
      ]);
      return [...templates.map((row) => this.serializeTemplate(row, false)), ...rows.map((row) => this.serialize(row))];
    }
    const targetStoreId = storeId ?? actor.storeMember?.storeId;
    if (!targetStoreId) throw new ForbiddenException("未绑定门店");
    await this.assertStoreReader(actor, targetStoreId);
    const cacheKey = `${actor.id}:${targetStoreId}`;
    const cached = this.listCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [rows, templates] = await Promise.all([
      this.prisma.dictionary.findMany({ where: { storeId: targetStoreId }, orderBy: { createdAt: "asc" }, include: { dictionaryItems: true } }),
      this.prisma.dictionaryTemplate.findMany({ where: { status: DictionaryStatus.ACTIVE }, orderBy: { createdAt: "asc" }, include: { templateItems: true } })
    ]);
    const value = [...templates.map((row) => this.serializeTemplate(row, true)), ...rows.map((row) => this.serialize(row))];
    this.listCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, value });
    return value;
  }

  async initializeDefaultsForStore(storeId: string, actorId: string) {
    const result = await this.ensureDefaults(storeId);
    const success = result.failed.length === 0;
    try {
      await this.prisma.auditEvent.create({ data: { action: success ? "settings.dictionary.defaults.initialized" : "settings.dictionary.defaults.initialized.failed", actorId, storeId, targetType: "Store", targetId: storeId, metadata: { result: success ? "SUCCESS" : "PARTIAL_FAILURE", created: result.created, skipped: result.skipped, failed: result.failed } } });
    } catch { /* preserve initialization result when audit persistence is unavailable */ }
    return { success, storeId, ...result };
  }

  async previewDefaultBackfill(user: AuthenticatedSettingsUser, storeId: string) {
    if (!(await this.permissions.authorize(user.id, "settings", "write"))) throw new ForbiddenException("仅总部管理员可补齐默认字典");
    const missing: Array<{ code: string; name: string; itemCount: number; missingItems?: string[] }> = [];
    for (const definition of DEFAULT_DICTIONARIES) {
      const dictionary = await this.prisma.dictionary.findUnique({ where: { storeId_code: { storeId, code: definition.code } }, include: { dictionaryItems: { select: { code: true, name: true } } } });
      if (!dictionary) {
        missing.push({ code: definition.code, name: definition.name, itemCount: definition.items.length, missingItems: [...definition.items] });
        continue;
      }
      const existingNames = new Set(dictionary.dictionaryItems.map((item) => item.name));
      const missingItems = definition.items.filter((name) => !existingNames.has(name));
      if (missingItems.length > 0) missing.push({ code: definition.code, name: definition.name, itemCount: missingItems.length, missingItems: [...missingItems] });
    }
    return { storeId, missing, missingCount: missing.length, missingItemCount: missing.reduce((sum, item) => sum + item.itemCount, 0) };
  }

  async backfillDefaults(user: AuthenticatedSettingsUser, storeId: string) {
    const actor = await this.actor(user);
    if (!(await this.permissions.authorize(actor.id, "settings", "write"))) throw new ForbiddenException("仅总部管理员可补齐默认字典");
    const preview = await this.previewDefaultBackfill(user, storeId);
    const result = await this.initializeDefaultsForStore(storeId, actor.id);
    return { ...result, missingBefore: preview.missingCount, missingItemCountBefore: preview.missingItemCount };
  }

  async catalog(user: AuthenticatedSettingsUser, query: DictionaryCatalogQueryDto, storeId?: string) {
    const actor = await this.actor(user);
    const targetStoreId = storeId ?? actor.storeMember?.storeId;
    if (!targetStoreId && !(await this.permissions.authorize(actor.id, "settings", "read"))) throw new ForbiddenException("未绑定门店");
    if (targetStoreId) await this.assertStoreReader(actor, targetStoreId);
    const { page, pageSize, skip } = normalizePagination(query.page, query.pageSize);
    const keyword = query.keyword?.trim();
    const where = {
      ...(targetStoreId ? { storeId: targetStoreId } : {}),
      ...(keyword ? { OR: [{ name: { contains: keyword, mode: "insensitive" as const } }, { code: { contains: keyword, mode: "insensitive" as const } }] } : {})
    };
    const [total, rows] = await Promise.all([
      this.prisma.dictionary.count({ where }),
      this.prisma.dictionary.findMany({ where, orderBy: [{ createdAt: "asc" }, { code: "asc" }], skip, take: pageSize })
    ]);
    const counts = await this.prisma.dictionaryItem.groupBy({ by: ["dictionaryId", "status"], where: { dictionaryId: { in: rows.map((row) => row.id) } }, _count: { _all: true } });
    const countMap = new Map<string, { active: number; inactive: number }>();
    for (const count of counts) {
      const current = countMap.get(count.dictionaryId) ?? { active: 0, inactive: 0 };
      current[count.status === DictionaryStatus.ACTIVE ? "active" : "inactive"] = count._count._all;
      countMap.set(count.dictionaryId, current);
    }
    return { items: rows.map((row) => ({ ...row, activeItemCount: countMap.get(row.id)?.active ?? 0, inactiveItemCount: countMap.get(row.id)?.inactive ?? 0 })), total, page, pageSize };
  }
  async create(user: AuthenticatedSettingsUser, dto: CreateDictionaryDto) {
    await this.assertManager(user, dto.storeId);
    const row = await this.prisma.dictionary.create({
      data: {
        storeId: dto.storeId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        items: dto.items.map((item) => item.trim()).filter(Boolean),
        status: dto.status ?? DictionaryStatus.ACTIVE,
        source: dto.source ?? "STORE",
        allowCustomItems: dto.allowCustomItems ?? true,
        allowDisableItems: dto.allowDisableItems ?? true,
        allowHierarchy: dto.allowHierarchy ?? false
      }
    });
    const dictionaryItems = await this.syncItems(row.id, dto.items);
    await this.recordAudit((await this.actor(user)).id, "settings.dictionary.created", row.id, row.storeId, { code: row.code, name: row.name });
    this.listCache.clear();
    return this.serialize({ ...row, dictionaryItems });
  }

  async update(user: AuthenticatedSettingsUser, id: string, dto: UpdateDictionaryDto) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertManager(user, dictionary.storeId);
    if (dto.version !== undefined && dto.version !== dictionary.version) throw new ConflictException("字典已被其他人修改，请刷新后重试");
    if (FIXED_DICTIONARY_CODES.has(dictionary.code)) {
      if (dto.status === DictionaryStatus.INACTIVE) throw new BadRequestException("系统固定字典不可停用");
      if (dto.items !== undefined) assertFixedDictionaryItems(dictionary.code, dto.items);
      if (dto.source !== undefined && dto.source !== dictionary.source) throw new BadRequestException("系统固定字典来源不可修改");
      if (dto.allowCustomItems === true) throw new BadRequestException("系统固定字典不可新增自定义项");
    }
    const row = await this.prisma.dictionary.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.items === undefined ? {} : { items: dto.items.map((item) => item.trim()).filter(Boolean) }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.source === undefined ? {} : { source: dto.source }),
        ...(dto.allowCustomItems === undefined ? {} : { allowCustomItems: dto.allowCustomItems }),
        ...(dto.allowDisableItems === undefined ? {} : { allowDisableItems: dto.allowDisableItems }),
        ...(dto.allowHierarchy === undefined ? {} : { allowHierarchy: dto.allowHierarchy }),
        version: { increment: 1 },
        updatedById: (await this.actor(user)).id
      }
    });
    const dictionaryItems = dto.items === undefined
      ? await this.prisma.dictionaryItem.findMany({ where: { dictionaryId: row.id } })
      : await this.syncItems(
        row.id,
        dto.items,
        FIXED_DICTIONARY_CODES.has(row.code),
        DEFAULT_DICTIONARIES.find((item) => item.code === row.code)?.itemCodes
      );
    await this.recordAudit((await this.actor(user)).id, "settings.dictionary.updated", row.id, row.storeId, { code: row.code, status: row.status });
    this.listCache.clear();
    return this.serialize({ ...row, dictionaryItems });
  }

  async remove(user: AuthenticatedSettingsUser, id: string, reason: string) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    const actor = await this.assertManager(user, dictionary.storeId);
    if (!reason?.trim()) {
      await this.recordFailure(actor.id, "settings.dictionary.disabled", id, dictionary.storeId, "停用字典必须填写原因");
      throw new BadRequestException("停用字典必须填写原因");
    }
    if (FIXED_DICTIONARY_CODES.has(dictionary.code)) {
      await this.recordFailure(actor.id, "settings.dictionary.disabled", id, dictionary.storeId, "系统固定字典不可删除");
      throw new BadRequestException("系统固定字典不可删除");
    }
    const row = await this.prisma.dictionary.update({ where: { id }, data: { status: DictionaryStatus.INACTIVE } });
    await this.recordAudit(actor.id, "settings.dictionary.disabled", row.id, row.storeId, { code: row.code, reason: reason.trim() });
    const dictionaryItems = await this.prisma.dictionaryItem.findMany({ where: { dictionaryId: row.id } });
    this.listCache.clear();
    return this.serialize({ ...row, dictionaryItems });
  }



  private async getItemOrThrow(id: string) {
    const item = await this.prisma.dictionaryItem.findUnique({ where: { id }, include: { dictionary: true } });
    if (!item) throw new NotFoundException("字典项不存在");
    return item;
  }

  async listItems(user: AuthenticatedSettingsUser, dictionaryId: string, query: DictionaryItemsQueryDto) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id: dictionaryId } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertStoreReader(user, dictionary.storeId);
    const { page, pageSize, skip } = normalizePagination(query.page, query.pageSize);
    const keyword = query.keyword?.trim();
    const where = {
      dictionaryId,
      parentId: query.parentId ?? null,
      ...(query.status ? { status: query.status } : {}),
      ...(keyword ? { OR: [{ name: { contains: keyword, mode: "insensitive" as const } }, { code: { contains: keyword, mode: "insensitive" as const } }] } : {})
    };
    const [total, items, parent] = await Promise.all([
      this.prisma.dictionaryItem.count({ where }),
      this.prisma.dictionaryItem.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], skip, take: pageSize }),
      query.parentId ? this.prisma.dictionaryItem.findUnique({ where: { id: query.parentId }, select: { id: true, code: true, name: true, parentId: true } }) : Promise.resolve(null)
    ]);
    return { items, total, page, pageSize, dictionaryVersion: dictionary.version, parent };
  }
  private async validateImport(user: AuthenticatedSettingsUser, dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id: dictionaryId } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    const actor = await this.assertManager(user, dictionary.storeId);
    if (dictionary.source !== "STORE" || !dictionary.allowCustomItems) throw new BadRequestException("当前字典不允许导入自定义项");
    const normalized = items.map((item, index) => ({ code: item.code?.trim() ?? "", name: item.name?.trim() ?? "", sortOrder: item.sortOrder ?? index, parentId: item.parentId ?? null, status: item.status ?? DictionaryStatus.ACTIVE }));
    const errors: Array<{ code: string; message: string }> = [];
    const seen = new Set<string>();
    for (const item of normalized) {
      if (!item.code || !item.name) errors.push({ code: item.code, message: "编码和名称不能为空" });
      if (seen.has(item.code)) errors.push({ code: item.code, message: "文件内编码重复" });
      seen.add(item.code);
      if (item.parentId && !dictionary.allowHierarchy) errors.push({ code: item.code, message: "当前字典不支持层级" });
    }
    const existing = await this.prisma.dictionaryItem.findMany({ where: { dictionaryId, code: { in: normalized.map((item) => item.code).filter(Boolean) } } });
    const existingMap = new Map(existing.map((item) => [item.code, item]));
    for (const item of normalized) {
      const current = existingMap.get(item.code);
      if (current?.isSystem && (current.name !== item.name || item.parentId !== current.parentId)) errors.push({ code: item.code, message: "系统固定项含义不可修改" });
      if (item.parentId === current?.id) errors.push({ code: item.code, message: "父级不能是自身" });
    }
    return { dictionary, actor, normalized, existingMap, errors };
  }

  async previewImportItems(user: AuthenticatedSettingsUser, dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>) {
    const { dictionary, normalized, existingMap, errors } = await this.validateImport(user, dictionaryId, items);
    const changes = normalized.map((item) => ({ code: item.code, name: item.name, action: existingMap.has(item.code) ? "UPDATE" : "CREATE" }));
    return { dictionaryId, dictionaryVersion: dictionary.version, canCommit: errors.length === 0, summary: { total: normalized.length, create: changes.filter((item) => item.action === "CREATE").length, update: changes.filter((item) => item.action === "UPDATE").length, error: errors.length }, changes, errors };
  }

  async commitImportItems(user: AuthenticatedSettingsUser, dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>, version?: number) {
    const { dictionary, actor, normalized, existingMap, errors } = await this.validateImport(user, dictionaryId, items);
    if (version !== undefined && version !== dictionary.version) throw new ConflictException("字典已被其他人修改，请重新预览");
    if (errors.length) throw new BadRequestException({ message: "导入预览存在错误，整批未提交", errors });
    const result = await this.prisma.$transaction(async (tx) => {
      const created: unknown[] = [];
      const updated: unknown[] = [];
      for (const item of normalized) {
        const current = existingMap.get(item.code);
        if (current) {
          updated.push(await tx.dictionaryItem.update({ where: { id: current.id }, data: { name: item.name, sortOrder: item.sortOrder, parentId: item.parentId, status: item.status, updatedById: actor.id } }));
        } else {
          created.push(await tx.dictionaryItem.create({ data: { dictionaryId, code: item.code, name: item.name, sortOrder: item.sortOrder, parentId: item.parentId, status: item.status, source: "STORE", updatedById: actor.id } }));
        }
      }
      const updatedDictionary = await tx.dictionary.update({ where: { id: dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: "settings.dictionary.items.imported", actorId: actor.id, storeId: dictionary.storeId, targetType: "Dictionary", targetId: dictionaryId, metadata: { mode: "PREVIEW_COMMIT", created: created.length, updated: updated.length, version: updatedDictionary.version } } });
      return { created, updated, version: updatedDictionary.version };
    });
    this.listCache.clear();
    return result;
  }
  async importItems(user: AuthenticatedSettingsUser, dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number }>) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id: dictionaryId } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    const actor = await this.assertManager(user, dictionary.storeId);
    if (dictionary.source !== "STORE" || !dictionary.allowCustomItems) throw new BadRequestException("当前字典不允许导入自定义项");
    const normalized = items.map((item, index) => ({ code: item.code.trim(), name: item.name.trim(), sortOrder: item.sortOrder ?? index })).filter((item) => item.code && item.name);
    if (normalized.length !== items.length) throw new BadRequestException("导入项编码和名称不能为空");
    const codes = new Set<string>();
    if (normalized.some((item) => codes.has(item.code) || codes.add(item.code) === undefined)) throw new ConflictException("导入文件包含重复编码，整批未导入");
    const [existing, inherited] = await Promise.all([
      this.prisma.dictionaryItem.findMany({ where: { dictionaryId, code: { in: normalized.map((item) => item.code) } }, select: { code: true } }),
      this.prisma.dictionaryTemplateItem.findMany({ where: { code: { in: normalized.map((item) => item.code) }, template: { status: DictionaryStatus.ACTIVE } }, select: { code: true } })
    ]);
    if (existing.length || inherited.length) { await this.recordFailure(actor.id, "settings.dictionary.items.imported", dictionaryId, dictionary.storeId, "编码已存在，请更换编码"); throw new ConflictException("编码已存在，请更换编码"); }
    return this.prisma.$transaction(async (tx) => { const created = []; for (const item of normalized) created.push(await tx.dictionaryItem.create({ data: { dictionaryId, code: item.code, name: item.name, sortOrder: item.sortOrder, source: "STORE", updatedById: actor.id } })); await tx.dictionary.update({ where: { id: dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } }); await tx.auditEvent.create({ data: { action: "settings.dictionary.items.imported", actorId: actor.id, storeId: dictionary.storeId, targetType: "Dictionary", targetId: dictionaryId, metadata: { count: created.length, mode: "ADD_ONLY" } } }); this.listCache.clear(); return created; });
  }
  async createItem(user: AuthenticatedSettingsUser, dictionaryId: string, dto: CreateDictionaryItemDto) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id: dictionaryId } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    const actor = await this.assertManager(user, dictionary.storeId);
    if (!dictionary.allowCustomItems || dictionary.source !== "STORE") throw new BadRequestException("当前字典不允许新增字典项");
    if (dto.parentId && !dictionary.allowHierarchy) throw new BadRequestException("当前字典不支持层级");
    const code = dto.code.trim();
    const [duplicate, inherited] = await Promise.all([
      this.prisma.dictionaryItem.findFirst({ where: { dictionaryId, parentId: dto.parentId ?? null, code } }),
      this.prisma.dictionaryTemplateItem.findFirst({ where: { code, template: { status: DictionaryStatus.ACTIVE } } })
    ]);
    if (duplicate || inherited) { await this.recordFailure(actor.id, "settings.dictionary.item.created", dictionaryId, dictionary.storeId, "编码已存在，请更换编码", { code }); throw new ConflictException("编码已存在，请更换编码"); }
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.dictionaryItem.create({ data: { dictionaryId, parentId: dto.parentId ?? null, code, name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0, status: dto.status ?? DictionaryStatus.ACTIVE, source: "STORE", disabledReason: dto.disabledReason, updatedById: actor.id } });
      await tx.dictionary.update({ where: { id: dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: "settings.dictionary.item.created", actorId: actor.id, storeId: dictionary.storeId, targetType: "DictionaryItem", targetId: item.id, metadata: { code: item.code } } });
      this.listCache.clear();
      return item;
    });
  }

  async updateItem(user: AuthenticatedSettingsUser, id: string, dto: UpdateDictionaryItemDto) {
    const item = await this.getItemOrThrow(id);
    const actor = await this.assertManager(user, item.dictionary.storeId);
    const inheritedDisabled = item.dictionary.source === "STORE" && dto.status === DictionaryStatus.ACTIVE ? await this.prisma.dictionaryTemplateItem.findFirst({ where: { code: item.code, status: DictionaryStatus.INACTIVE, template: { status: DictionaryStatus.ACTIVE } } }) : null;
    if ((item.status === DictionaryStatus.INACTIVE && dto.status === DictionaryStatus.ACTIVE && item.dictionary.source !== "STORE") || inheritedDisabled) throw new BadRequestException("总部已禁用项不可重新启用");
    if (dto.status === DictionaryStatus.INACTIVE && !dto.disabledReason?.trim()) { await this.recordFailure(actor.id, "settings.dictionary.item.disabled", id, item.dictionary.storeId, "停用字典项必须填写原因"); throw new BadRequestException("停用字典项必须填写原因"); }
    const statusOnly = dto.status !== undefined && dto.name === undefined && dto.parentId === undefined && dto.sortOrder === undefined;
    if (item.dictionary.source !== "STORE" || item.isSystem) {
      if (!item.dictionary.allowDisableItems || !statusOnly) throw new BadRequestException("系统字典项仅允许启停");
    }
    if (dto.version !== undefined && dto.version !== item.dictionary.version) { await this.recordFailure(actor.id, "settings.dictionary.item.updated", id, item.dictionary.storeId, "字典已被其他人修改，请刷新后重试"); throw new ConflictException("字典已被其他人修改，请刷新后重试"); }
    if (dto.parentId !== undefined && !item.dictionary.allowHierarchy) throw new BadRequestException("当前字典不支持层级");
    if (dto.parentId === id) throw new BadRequestException("父级不能是自身");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dictionaryItem.update({ where: { id }, data: { ...(dto.name === undefined ? {} : { name: dto.name.trim() }), ...(dto.parentId === undefined ? {} : { parentId: dto.parentId }), ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }), ...(dto.status === undefined ? {} : { status: dto.status }), ...(dto.disabledReason === undefined ? {} : { disabledReason: dto.disabledReason }), updatedById: actor.id } });
      await tx.dictionary.update({ where: { id: item.dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: dto.status === DictionaryStatus.INACTIVE ? "settings.dictionary.item.disabled" : "settings.dictionary.item.updated", actorId: actor.id, storeId: item.dictionary.storeId, targetType: "DictionaryItem", targetId: id, metadata: { status: dto.status } } });
      this.listCache.clear();
      return updated;
    });
  }

  async setItemStatus(user: AuthenticatedSettingsUser, id: string, status: DictionaryStatus, reason?: string, version?: number) {
    return this.updateItem(user, id, { status, disabledReason: reason, version });
  }

  async removeItem(user: AuthenticatedSettingsUser, id: string, reason?: string) {
    const item = await this.getItemOrThrow(id);
    const actor = await this.assertManager(user, item.dictionary.storeId);
    if (!reason?.trim()) { await this.recordFailure(actor.id, "settings.dictionary.item.deleted", id, item.dictionary.storeId, "删除字典项必须填写原因"); throw new BadRequestException("删除字典项必须填写原因"); }
    if (item.isSystem || item.source !== "STORE") throw new BadRequestException("系统字典项不可删除");
    if (item.usageCount > 0) { await this.recordFailure(actor.id, "settings.dictionary.item.deleted", id, item.dictionary.storeId, "已被业务数据引用，只能停用不能删除", { usageCount: item.usageCount }); throw new BadRequestException("已被业务数据引用，只能停用不能删除"); }
    if (await this.prisma.dictionaryItem.count({ where: { parentId: id } })) throw new BadRequestException("存在子级字典项，请先处理子级");
    const deleted = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.dictionaryItem.delete({ where: { id } });
      await tx.dictionary.update({ where: { id: item.dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      await tx.auditEvent.create({ data: { action: "settings.dictionary.item.deleted", actorId: actor.id, storeId: item.dictionary.storeId, targetType: "DictionaryItem", targetId: removed.id, metadata: { code: item.code, reason: reason?.trim() } } });
      return removed;
    });
    this.listCache.clear();
    return deleted;
  }
  private async syncItems(dictionaryId: string, names: readonly string[], isSystem = false, stableCodes?: readonly string[]) {
    const normalizedNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    const existing = await this.prisma.dictionaryItem.findMany({ where: { dictionaryId }, orderBy: { sortOrder: "asc" } });
    const byName = new Map(existing.map((item) => [item.name, item]));
    let nextCode = existing.reduce((max, item) => {
      const match = /^ITEM_(\d+)$/.exec(item.code);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    for (const [sortOrder, name] of normalizedNames.entries()) {
      const current = byName.get(name);
      const code = stableCodes?.[sortOrder] ?? current?.code ?? `ITEM_${String(nextCode++).padStart(3, "0")}`;
      if (current) {
        await this.prisma.dictionaryItem.update({
          where: { id: current.id },
          data: { code, name, sortOrder, isSystem, status: current?.status ?? DictionaryStatus.ACTIVE }
        });
      } else {
        await this.prisma.dictionaryItem.upsert({
          where: { dictionaryId_code: { dictionaryId, code } },
          create: { dictionaryId, code, name, sortOrder, isSystem, source: isSystem ? "SYSTEM" : "STORE", status: DictionaryStatus.ACTIVE },
          update: { name, sortOrder, isSystem }
        });
      }
    }
    if (normalizedNames.length > 0) {
      await this.prisma.dictionaryItem.updateMany({
        where: { dictionaryId, name: { notIn: normalizedNames } },
        data: { status: DictionaryStatus.INACTIVE }
      });
    }
    await this.prisma.dictionary.update({ where: { id: dictionaryId }, data: { mode: DictionaryMode.NORMALIZED } });
    return this.prisma.dictionaryItem.findMany({ where: { dictionaryId } });
  }
}


function assertFixedDictionaryItems(code: string, items: string[]) {
  const definition = DEFAULT_DICTIONARIES.find((item) => item.code === code);
  const expected = new Set(definition?.items ?? []);
  const actual = new Set(items.map((item) => item.trim()).filter(Boolean));
  if (expected.size !== actual.size || [...expected].some((item) => !actual.has(item))) {
    throw new BadRequestException("系统固定字典不允许新增或删除编码");
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DictionaryMode, DictionaryStatus, Prisma } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDictionaryDto, CreateDictionaryItemDto, UpdateDictionaryDto, UpdateDictionaryItemDto } from "./dto/dictionary.dto";

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
  constructor(private readonly prisma: PrismaService) {}

  private async actor(user: AuthenticatedSettingsUser) {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async assertManager(user: AuthenticatedSettingsUser, storeId: string) {
    const actor = await this.actor(user);
    if (!PermissionPolicy.isStoreManager(actor, storeId)) {
      throw new ForbiddenException("仅店长或系统审核员可维护基础字典");
    }
    return actor;
  }

  private async assertStoreReader(user: AuthenticatedSettingsUser, storeId: string) {
    const actor = await this.actor(user);
    if (actor.isAuditor) return actor;
    if (!actor.storeMember || actor.storeMember.storeId !== storeId) {
      throw new ForbiddenException("无权读取其他门店的基础字典");
    }
    return actor;
  }
  private serialize(dictionary: Prisma.DictionaryGetPayload<{ include: { dictionaryItems: true } }>) {
    const normalizedItems = dictionary.dictionaryItems
      .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));
    return {
      ...dictionary,
      items: normalizedItems.length > 0
        ? normalizedItems.map((item) => item.name)
        : Array.isArray(dictionary.items) ? dictionary.items.filter((item): item is string => typeof item === "string") : [],
      dictionaryItems: normalizedItems
    };
  }

  private async ensureDefaults(storeId: string) {
    for (const item of DEFAULT_DICTIONARIES) {
      const existing = await this.prisma.dictionary.findUnique({ where: { storeId_code: { storeId, code: item.code } } });
      const dictionary = await this.prisma.dictionary.upsert({
        where: { storeId_code: { storeId, code: item.code } },
        create: { storeId, name: item.name, code: item.code, items: [...item.items], source: FIXED_DICTIONARY_CODES.has(item.code) ? "SYSTEM" : "STORE", allowCustomItems: !FIXED_DICTIONARY_CODES.has(item.code), allowDisableItems: true },
        update: {}
      });
      // 非固定字典只在首次创建时写入初始项，后续由门店按业务自行增减。
      if (!existing || FIXED_DICTIONARY_CODES.has(item.code)) {
        await this.syncItems(dictionary.id, item.items, FIXED_DICTIONARY_CODES.has(item.code), item.itemCodes);
      }
    }
  }

  async list(user: AuthenticatedSettingsUser, storeId?: string) {
    const actor = await this.actor(user);
    const targetStoreId = storeId ?? actor.storeMember?.storeId;
    if (!targetStoreId) throw new ForbiddenException("未绑定门店");
    await this.assertStoreReader(actor, targetStoreId);
    await this.ensureDefaults(targetStoreId);
    const rows = await this.prisma.dictionary.findMany({ where: { storeId: targetStoreId }, orderBy: { createdAt: "asc" }, include: { dictionaryItems: true } });
    return rows.map((row) => this.serialize(row));
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
    return this.serialize({ ...row, dictionaryItems });
  }

  async update(user: AuthenticatedSettingsUser, id: string, dto: UpdateDictionaryDto) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertManager(user, dictionary.storeId);
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
        ...(dto.allowHierarchy === undefined ? {} : { allowHierarchy: dto.allowHierarchy })
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
    return this.serialize({ ...row, dictionaryItems });
  }

  async remove(user: AuthenticatedSettingsUser, id: string) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertManager(user, dictionary.storeId);
    if (FIXED_DICTIONARY_CODES.has(dictionary.code)) throw new BadRequestException("系统固定字典不可删除");
    const row = await this.prisma.dictionary.update({ where: { id }, data: { status: DictionaryStatus.INACTIVE } });
    const dictionaryItems = await this.prisma.dictionaryItem.findMany({ where: { dictionaryId: row.id } });
    return this.serialize({ ...row, dictionaryItems });
  }


  private async getItemOrThrow(id: string) {
    const item = await this.prisma.dictionaryItem.findUnique({ where: { id }, include: { dictionary: true } });
    if (!item) throw new NotFoundException("字典项不存在");
    return item;
  }

  async listItems(user: AuthenticatedSettingsUser, dictionaryId: string) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id: dictionaryId } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertStoreReader(user, dictionary.storeId);
    return this.prisma.dictionaryItem.findMany({ where: { dictionaryId }, orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { code: "asc" }] });
  }

  async createItem(user: AuthenticatedSettingsUser, dictionaryId: string, dto: CreateDictionaryItemDto) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id: dictionaryId } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    const actor = await this.assertManager(user, dictionary.storeId);
    if (!dictionary.allowCustomItems || dictionary.source !== "STORE") throw new BadRequestException("当前字典不允许新增字典项");
    if (dto.parentId && !dictionary.allowHierarchy) throw new BadRequestException("当前字典不支持层级");
    const duplicate = await this.prisma.dictionaryItem.findFirst({ where: { dictionaryId, parentId: dto.parentId ?? null, code: dto.code.trim() } });
    if (duplicate) throw new ConflictException("同一层级下字典编码已存在");
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.dictionaryItem.create({ data: { dictionaryId, parentId: dto.parentId ?? null, code: dto.code.trim(), name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0, status: dto.status ?? DictionaryStatus.ACTIVE, source: "STORE", disabledReason: dto.disabledReason, updatedById: actor.id } });
      await tx.dictionary.update({ where: { id: dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      return item;
    });
  }

  async updateItem(user: AuthenticatedSettingsUser, id: string, dto: UpdateDictionaryItemDto) {
    const item = await this.getItemOrThrow(id);
    const actor = await this.assertManager(user, item.dictionary.storeId);
    const statusOnly = dto.status !== undefined && dto.name === undefined && dto.parentId === undefined && dto.sortOrder === undefined;
    if (item.dictionary.source !== "STORE" || item.isSystem) {
      if (!item.dictionary.allowDisableItems || !statusOnly) throw new BadRequestException("系统字典项仅允许启停");
    }
    if (dto.version !== undefined && dto.version !== item.dictionary.version) throw new ConflictException("字典已被其他人修改，请刷新后重试");
    if (dto.parentId !== undefined && !item.dictionary.allowHierarchy) throw new BadRequestException("当前字典不支持层级");
    if (dto.parentId === id) throw new BadRequestException("父级不能是自身");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dictionaryItem.update({ where: { id }, data: { ...(dto.name === undefined ? {} : { name: dto.name.trim() }), ...(dto.parentId === undefined ? {} : { parentId: dto.parentId }), ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }), ...(dto.status === undefined ? {} : { status: dto.status }), ...(dto.disabledReason === undefined ? {} : { disabledReason: dto.disabledReason }), updatedById: actor.id } });
      await tx.dictionary.update({ where: { id: item.dictionaryId }, data: { version: { increment: 1 }, updatedById: actor.id } });
      return updated;
    });
  }

  async setItemStatus(user: AuthenticatedSettingsUser, id: string, status: DictionaryStatus, reason?: string) {
    return this.updateItem(user, id, { status, disabledReason: reason });
  }

  async removeItem(user: AuthenticatedSettingsUser, id: string) {
    const item = await this.getItemOrThrow(id);
    await this.assertManager(user, item.dictionary.storeId);
    if (item.isSystem || item.source !== "STORE") throw new BadRequestException("系统字典项不可删除");
    if (item.usageCount > 0) throw new BadRequestException("已被业务数据引用，只能停用不能删除");
    if (await this.prisma.dictionaryItem.count({ where: { parentId: id } })) throw new BadRequestException("存在子级字典项，请先处理子级");
    return this.prisma.dictionaryItem.delete({ where: { id } });
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
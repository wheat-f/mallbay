import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DictionaryMode, DictionaryStatus, Prisma } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDictionaryDto, UpdateDictionaryDto } from "./dto/dictionary.dto";

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
      .filter((item) => item.status === DictionaryStatus.ACTIVE)
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
        create: { storeId, name: item.name, code: item.code, items: [...item.items] },
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
        status: dto.status ?? DictionaryStatus.ACTIVE
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
    }
    const row = await this.prisma.dictionary.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.items === undefined ? {} : { items: dto.items.map((item) => item.trim()).filter(Boolean) }),
        ...(dto.status === undefined ? {} : { status: dto.status })
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
          data: { code, name, sortOrder, isSystem, status: DictionaryStatus.ACTIVE }
        });
      } else {
        await this.prisma.dictionaryItem.upsert({
          where: { dictionaryId_code: { dictionaryId, code } },
          create: { dictionaryId, code, name, sortOrder, isSystem, status: DictionaryStatus.ACTIVE },
          update: { name, sortOrder, isSystem, status: DictionaryStatus.ACTIVE }
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

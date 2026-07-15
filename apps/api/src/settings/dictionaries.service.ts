import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DictionaryStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDictionaryDto, UpdateDictionaryDto } from "./dto/dictionary.dto";

const DEFAULT_DICTIONARIES = [
  { name: "施工类型", code: "CONSTRUCTION_TYPE", items: ["漆面保护膜", "改色膜", "隔热膜", "改装", "检查"] },
  { name: "施工地点", code: "CONSTRUCTION_LOCATION", items: ["到店", "外出"] },
  { name: "线索来源", code: "LEAD_SOURCE", items: ["抖音", "小红书", "快手", "门店", "转介绍", "合作伙伴", "其他"] },
  { name: "客户类型", code: "CUSTOMER_TYPE", items: ["个人客户", "企业客户"] },
  { name: "性别", code: "GENDER", items: ["男", "女", "未知"] },
  { name: "产品分类", code: "PRODUCT_CATEGORY", items: ["漆面保护膜", "改色膜", "隔热膜", "改装", "其他"] },
  { name: "产品单位", code: "PRODUCT_UNIT", items: ["卷", "米", "平方米", "平方厘米", "件"] },
  { name: "质保周期", code: "WARRANTY_PERIOD", items: ["3年", "5年", "10年"] },
  { name: "付款类型", code: "PAYMENT_TYPE", items: ["定金", "尾款", "全款"] },
  { name: "收款账户类型", code: "PAYMENT_ACCOUNT_TYPE", items: ["对公账户", "个人账户", "微信", "支付宝", "其他"] },
  { name: "质检结果", code: "QUALITY_CHECK_RESULT", items: ["通过", "需要返工"] },
  { name: "售后责任", code: "AFTER_SALE_RESPONSIBILITY", items: ["客户人为损坏", "施工方责任", "原厂产品质量", "门店服务责任"] },
  { name: "费用申请类型", code: "FINANCE_APPLICATION_TYPE", items: ["费用申请", "报销申请"] },
  { name: "财务附件类别", code: "FINANCE_ATTACHMENT_CATEGORY", items: ["发票", "合同", "付款凭证", "其他"] }
] as const;

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
  private serialize(dictionary: { id: string; storeId: string; name: string; code: string; items: unknown; status: DictionaryStatus; createdAt: Date; updatedAt: Date }) {
    return {
      ...dictionary,
      items: Array.isArray(dictionary.items) ? dictionary.items.filter((item): item is string => typeof item === "string") : []
    };
  }

  private async ensureDefaults(storeId: string) {
    for (const item of DEFAULT_DICTIONARIES) {
      await this.prisma.dictionary.upsert({
        where: { storeId_code: { storeId, code: item.code } },
        create: { storeId, name: item.name, code: item.code, items: [...item.items] },
        update: {}
      });
    }
  }

  async list(user: AuthenticatedSettingsUser, storeId?: string) {
    const actor = await this.actor(user);
    const targetStoreId = storeId ?? actor.storeMember?.storeId;
    if (!targetStoreId) throw new ForbiddenException("未绑定门店");
    await this.assertStoreReader(actor, targetStoreId);
    await this.ensureDefaults(targetStoreId);
    const rows = await this.prisma.dictionary.findMany({ where: { storeId: targetStoreId }, orderBy: { createdAt: "asc" } });
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
    return this.serialize(row);
  }

  async update(user: AuthenticatedSettingsUser, id: string, dto: UpdateDictionaryDto) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertManager(user, dictionary.storeId);
    const row = await this.prisma.dictionary.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.items === undefined ? {} : { items: dto.items.map((item) => item.trim()).filter(Boolean) }),
        ...(dto.status === undefined ? {} : { status: dto.status })
      }
    });
    return this.serialize(row);
  }

  async remove(user: AuthenticatedSettingsUser, id: string) {
    const dictionary = await this.prisma.dictionary.findUnique({ where: { id } });
    if (!dictionary) throw new NotFoundException("字典不存在");
    await this.assertManager(user, dictionary.storeId);
    const row = await this.prisma.dictionary.update({ where: { id }, data: { status: DictionaryStatus.INACTIVE } });
    return this.serialize(row);
  }
}

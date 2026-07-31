import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";
import { SettingsAccessService, type SettingsUser } from "./settings-access.service";

type AuditQuery = { action?: string; from?: string; to?: string; limit?: number; offset?: number; page?: number; pageSize?: number; domain?: string };

@Injectable()
export class SettingsAuditService {
  constructor(private readonly prisma: PrismaService, private readonly access: SettingsAccessService, private readonly permissions: PermissionsService) {}

  async list(user: SettingsUser, input: AuditQuery) {
    const actor = await this.access.resolveUser(user);
    const canGlobal = await this.permissions.authorize(actor.id, "settings", "read");
    const storeId = actor.storeMember?.storeId;
    const canFinance = Boolean(storeId && await this.permissions.authorize(actor.id, "finance", "read", { storeId }));
    if (!canGlobal && !canFinance && (!actor.storeMember || !["MANAGER", "FINANCE"].includes(actor.storeMember.position))) {
      throw new ForbiddenException("当前角色无权访问审计");
    }
    const requestedDomain = input.domain?.trim().toUpperCase();
    // Legacy position === "FINANCE" && requestedDomain !== "FINANCE" rule is now permission-backed.
    if (requestedDomain && !canGlobal && canFinance && requestedDomain !== "FINANCE") {
      throw new ForbiddenException("财务只能访问财务审计");
    }
    if (requestedDomain === "FINANCE" && !canGlobal && !canFinance) {
      throw new ForbiddenException("当前角色无权访问财务审计");
    }
    if (!canGlobal && canFinance && !requestedDomain) {
      input = { ...input, domain: "FINANCE" };
    }

    const limit = Math.min(Math.max(input.pageSize ?? input.limit ?? 20, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const offset = input.offset ?? (page - 1) * limit;
    const predicates: Prisma.AuditEventWhereInput[] = [];
    if (input.action) predicates.push({ action: { contains: input.action } });
    if (input.from || input.to) {
      predicates.push({ createdAt: { ...(input.from ? { gte: new Date(input.from) } : {}), ...(input.to ? { lte: new Date(input.to) } : {}) } });
    }
    if (input.domain) predicates.push({ action: { contains: `settings.${input.domain.toLowerCase()}` } });
    const where: Prisma.AuditEventWhereInput = {
      ...(predicates.length ? { AND: predicates } : {}),
      ...(!canGlobal ? { storeId: actor.storeMember!.storeId } : {})
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
      this.prisma.auditEvent.count({ where })
    ]);
    const enrichedRows = await this.enrichRows(rows.map((row) => ({ ...row, metadata: maskSensitive(row.metadata) })));
    return { rows: enrichedRows, total, limit, offset, page: Math.floor(offset / limit) + 1, pageSize: limit };
  }

  private async enrichRows(rows: Array<{
    id: string;
    action: string;
    actorId: string | null;
    storeId: string | null;
    targetType: string;
    targetId: string | null;
    createdAt: Date;
    metadata: Prisma.JsonValue;
  }>) {
    const actorIds = [...new Set(rows.flatMap((row) => row.actorId ? [row.actorId] : []))];
    const storeIds = [...new Set(rows.flatMap((row) => row.storeId ? [row.storeId] : []))];
    const configVersionIds = [...new Set(rows.flatMap((row) => row.targetType === "SettingsConfigVersion" && row.targetId ? [row.targetId] : []))];
    const migrationReviewIds = [...new Set(rows.flatMap((row) => row.targetType === "SettingsMigrationReview" && row.targetId ? [row.targetId] : []))];
    const [users, stores, configVersions, migrationReviews] = await Promise.all([
      actorIds.length ? this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, nickname: true, username: true } }) : [],
      storeIds.length ? this.prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : [],
      configVersionIds.length ? this.prisma.settingsConfigVersion.findMany({ where: { id: { in: configVersionIds } }, select: { id: true, capabilityCode: true, domain: true, scopeId: true, version: true } }) : [],
      migrationReviewIds.length ? this.prisma.settingsMigrationReview.findMany({ where: { id: { in: migrationReviewIds } }, select: { id: true, sourceType: true, reason: true } }) : []
    ]);
    const userById = new Map(users.map((user) => [user.id, user.nickname ?? user.username]));
    const storeById = new Map(stores.map((store) => [store.id, store.name]));
    const configVersionById = new Map(configVersions.map((version) => [version.id, version]));
    const migrationReviewById = new Map(migrationReviews.map((review) => [review.id, review]));
    return rows.map((row) => ({
      ...row,
      actionLabel: getAuditActionLabel(row.action),
      actorName: row.actorId ? userById.get(row.actorId) ?? "未知用户" : "系统",
      storeName: row.storeId ? storeById.get(row.storeId) ?? "未知门店" : null,
      targetTypeLabel: getAuditTargetTypeLabel(row.targetType),
      targetName: getAuditTargetName(row, configVersionById, migrationReviewById)
    }));
  }
  async export(user: SettingsUser, input: Omit<AuditQuery, "limit" | "offset" | "page" | "pageSize">) {
    const first = await this.list(user, { ...input, limit: 1, offset: 0 });
    if (first.total > 10000) throw new BadRequestException("导出数量超过 10,000 条，请缩小范围");
    const rows: Array<(typeof first.rows)[number]> = [];
    for (let offset = 0; offset < first.total; offset += 100) {
      const page = await this.list(user, { ...input, limit: 100, offset });
      rows.push(...page.rows);
      if (!page.rows.length) break;
    }
    const actor = await this.access.resolveUser(user);
    const canGlobal = await this.permissions.authorize(actor.id, "settings", "read");
    await this.prisma.auditEvent.create({
      data: {
        action: "settings.audit.exported",
        actorId: actor.id,
        storeId: canGlobal ? null : actor.storeMember?.storeId,
        targetType: "SettingsAuditExport",
        metadata: { count: rows.length, filters: input as Prisma.InputJsonValue }
      }
    });
    return { rows };
  }
}


const AUDIT_ACTION_LABELS: Record<string, string> = {
  "settings.audit.exported": "导出设置审计",
  "settings.config.draft.created": "创建配置草稿",
  "settings.config.draft.updated": "更新配置草稿",
  "settings.config.validated": "校验配置",
  "settings.config.validation.failed": "配置校验失败",
  "settings.config.published": "发布配置",
  "settings.config.withdrawn": "撤回配置",
  "settings.migration.review.resolved": "确认迁移待办",
  "settings.migration.review.ignored": "忽略迁移待办",
  "settings.finance_settlement.policy_migrated": "迁移财务结算策略"
};

const AUDIT_TARGET_TYPE_LABELS: Record<string, string> = {
  SettingsAuditExport: "设置审计导出",
  SettingsConfigVersion: "设置配置版本",
  SettingsMigrationReview: "设置迁移待办",
  User: "用户",
  Store: "门店"
};

const CAPABILITY_LABELS: Record<string, string> = {
  "settings.dictionary": "基础字典",
  "store.dictionary": "门店基础字典",
  "settings.permissions": "角色与权限",
  "settings.security": "安全策略",
  "settings.audit.global": "全局审计",
  "store.profile": "门店资料",
  "store.operations": "门店运营",
  "store.notifications": "门店通知",
  "store.capacity": "施工容量",
  "finance.labor_cost": "岗位小时成本",
  "finance.settlement": "财务结算",
  "finance.accounts": "收款账户",
  "finance.audit": "财务审计",
  "account.profile": "个人账号"
};

function getAuditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/^settings\./, "设置 · ").replace(/[._]/g, " · ");
}

function getAuditTargetTypeLabel(targetType: string) {
  return AUDIT_TARGET_TYPE_LABELS[targetType] ?? targetType;
}

function getAuditTargetName(
  row: { targetType: string; targetId: string | null },
  configVersionById: Map<string, { id: string; capabilityCode: string; domain: string; scopeId: string; version: number }>,
  migrationReviewById: Map<string, { id: string; sourceType: string; reason: string }>
) {
  if (row.targetType === "SettingsConfigVersion" && row.targetId) {
    const version = configVersionById.get(row.targetId);
    if (version) return `${CAPABILITY_LABELS[version.capabilityCode] ?? version.capabilityCode} · ${version.domain === "HQ" ? "总部" : version.domain === "FINANCE" ? "财务" : version.domain === "STORE" ? "门店" : "个人"} · v${version.version}`;
  }
  if (row.targetType === "SettingsMigrationReview" && row.targetId) {
    const review = migrationReviewById.get(row.targetId);
    if (review) return `${review.sourceType === "SETTINGS_CONFIG_VERSION" ? "设置配置" : review.sourceType === "FINANCE_POLICY" ? "财务策略" : review.sourceType}迁移待办`;
  }
  if (row.targetType === "SettingsAuditExport") return "设置审计导出";
  return row.targetType ? getAuditTargetTypeLabel(row.targetType) : "系统操作";
}
function maskSensitive(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, /password|secret|token|accessKey|密钥|密码|令牌/i.test(key) ? "***" : maskSensitive(child as Prisma.JsonValue)]
    ));
  }
  return value;
}

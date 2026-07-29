import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SettingsConfigStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsAccessService, type SettingsUser } from "./settings-access.service";
import { CreateConfigVersionDto, UpdateConfigVersionDto } from "./dto/config-version.dto";
import { validateFinanceSettlementPolicy } from "./finance-settlement-policy";

@Injectable()
export class ConfigVersionsService {
  private readonly listCache = new Map<string, { expiresAt: number; value: any }>();
  constructor(private readonly prisma: PrismaService, private readonly access: SettingsAccessService) {}
  async expireStaleDrafts() {
    const now = Date.now();
    const expiredPublished = await this.prisma.settingsConfigVersion.updateMany({ where: { status: SettingsConfigStatus.PUBLISHED, expiresAt: { lt: new Date(now) } }, data: { status: SettingsConfigStatus.EXPIRED } });
    const staleCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDayCutoff = new Date(now - 23 * 24 * 60 * 60 * 1000);
    const oneDayCutoff = new Date(now - 29 * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.settingsConfigVersion.findMany({ where: { status: { in: [SettingsConfigStatus.DRAFT, SettingsConfigStatus.VALIDATION_FAILED] }, updatedAt: { lt: sevenDayCutoff } }, select: { id: true, createdById: true, scopeId: true, capabilityCode: true, updatedAt: true } });
    const stale = candidates.filter((row) => row.updatedAt < staleCutoff);
    const sevenDayRows = candidates.filter((row) => row.updatedAt >= oneDayCutoff && row.updatedAt < sevenDayCutoff);
    const oneDayRows = candidates.filter((row) => row.updatedAt >= staleCutoff && row.updatedAt < oneDayCutoff);
    const reminderIds = [...sevenDayRows, ...oneDayRows].map((row) => row.id);
    const reminded = reminderIds.length ? await this.prisma.auditEvent.findMany({ where: { action: { in: ["settings.config.expiry.reminder.7d", "settings.config.expiry.reminder.1d"] }, targetType: "SettingsConfigVersion", targetId: { in: reminderIds } }, select: { action: true, targetId: true } }) : [];
    const remindedKeys = new Set(reminded.map((row) => `${row.action}:${row.targetId}`));
    const reminders = [
      ...sevenDayRows.filter((row) => !remindedKeys.has(`settings.config.expiry.reminder.7d:${row.id}`)).map((row) => ({ row, days: 7, action: "settings.config.expiry.reminder.7d" })),
      ...oneDayRows.filter((row) => !remindedKeys.has(`settings.config.expiry.reminder.1d:${row.id}`)).map((row) => ({ row, days: 1, action: "settings.config.expiry.reminder.1d" }))
    ];
    await this.prisma.$transaction(async (tx) => {
      for (const reminder of reminders) {
        await tx.notification.create({ data: { userId: reminder.row.createdById, type: "SETTINGS_CONFIG_EXPIRING", payload: { versionId: reminder.row.id, capabilityCode: reminder.row.capabilityCode, message: `配置草稿将在 ${reminder.days} 天后过期，请及时发布或复制新草稿` } } });
        await tx.auditEvent.create({ data: { action: reminder.action, actorId: null, storeId: reminder.row.scopeId === "global" ? null : reminder.row.scopeId, targetType: "SettingsConfigVersion", targetId: reminder.row.id, metadata: { daysRemaining: reminder.days } } });
      }
      if (stale.length) {
        await tx.settingsConfigVersion.updateMany({ where: { id: { in: stale.map((row) => row.id) } }, data: { status: SettingsConfigStatus.EXPIRED } });
        await tx.auditEvent.createMany({ data: stale.map((row) => ({ action: "settings.config.expired", actorId: null, storeId: row.scopeId === "global" ? null : row.scopeId, targetType: "SettingsConfigVersion", targetId: row.id, metadata: { reason: "草稿超过 30 天自动过期", createdById: row.createdById } })) });
      }
    });
    if (expiredPublished.count || stale.length || reminders.length) this.listCache.clear();
    return { expired: stale.length, reminded: reminders.length };
  }
  async list(user: SettingsUser, capabilityCode?: string, scopeId?: string, requestedPage = 1, requestedPageSize = 20) {
    await this.expireStaleDrafts();
    const page = Math.max(1, requestedPage);
    const pageSize = Math.min(100, Math.max(1, requestedPageSize));
    const actor = await this.access.resolveUser(user);
    const visible = await this.access.getCapabilities(actor);
    const codes = visible.map((item) => item.code).filter((code) => !capabilityCode || code === capabilityCode);
    if (capabilityCode && !codes.includes(capabilityCode)) throw new ForbiddenException("当前角色无权访问该设置");
    if (capabilityCode) await this.access.assert(actor, capabilityCode, "view", scopeId);
    const effectiveScope = scopeId ?? (actor.isAuditor ? undefined : actor.storeMember?.storeId ?? actor.id);
    const cacheKey = JSON.stringify([actor.id, Boolean(actor.isAuditor), capabilityCode ?? null, effectiveScope ?? null, page, pageSize]);
    const cached = this.listCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const where = { capabilityCode: { in: codes }, ...(effectiveScope ? { scopeId: effectiveScope } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.settingsConfigVersion.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.settingsConfigVersion.count({ where })
    ]);
    const value = { rows: rows.map((row) => this.sanitize(row)), total, page, pageSize };
    this.listCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, value });
    return value;
  }
  async create(user: SettingsUser, dto: CreateConfigVersionDto) {
    const { actor, scopeId } = await this.access.assert(user, dto.capabilityCode, "create", dto.scopeId);
    if (dto.requestId) {
      const existing = await this.prisma.settingsConfigVersion.findFirst({ where: { createdById: actor.id, requestId: dto.requestId } });
      if (existing) return this.sanitize(existing);
    }
    if (!dto.payload || Object.keys(dto.payload).length === 0) throw new BadRequestException("配置内容不能为空");
    const latest = await this.prisma.settingsConfigVersion.findFirst({ where: { capabilityCode: dto.capabilityCode, scopeId: scopeId ?? dto.scopeId }, orderBy: { version: "desc" }, select: { version: true } });
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.settingsConfigVersion.create({ data: { domain: dto.domain, capabilityCode: dto.capabilityCode, scopeId: scopeId ?? dto.scopeId, version: (latest?.version ?? 0) + 1, payload: dto.payload as Prisma.InputJsonValue, effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, createdById: actor.id, updatedById: actor.id, requestId: dto.requestId ?? null } });
      await this.audit(tx, "settings.config.draft.created", actor.id, row.id, { capabilityCode: row.capabilityCode, scopeId: row.scopeId, after: { version: row.version, status: row.status } });
      this.listCache.clear();
      return this.sanitize(row);
    });
  }
  async update(user: SettingsUser, id: string, dto: UpdateConfigVersionDto) {
    const row = await this.prisma.settingsConfigVersion.findUnique({ where: { id } }); if (!row) throw new NotFoundException("配置版本不存在");
    const { actor } = await this.access.assert(user, row.capabilityCode, "edit", row.scopeId); if (dto.requestId) { const existingRequest = await this.prisma.settingsConfigVersion.findFirst({ where: { createdById: actor.id, requestId: dto.requestId } }); if (existingRequest && existingRequest.id === id) return this.sanitize(existingRequest); if (existingRequest) throw new ConflictException("请求标识已用于其他配置操作"); }
    if (row.status !== SettingsConfigStatus.DRAFT && row.status !== SettingsConfigStatus.VALIDATION_FAILED) throw new ConflictException("已发布版本不可直接修改，请创建新草稿");
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== row.version) throw new ConflictException("配置版本已被其他人修改，请刷新后重试");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.settingsConfigVersion.update({ where: { id }, data: { payload: dto.payload as Prisma.InputJsonValue, ...(dto.effectiveAt === undefined ? {} : { effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null }), ...(dto.expiresAt === undefined ? {} : { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }), updatedById: actor.id, ...(dto.requestId ? { requestId: dto.requestId } : {}), status: SettingsConfigStatus.DRAFT, validationErrors: Prisma.JsonNull } });
      await this.audit(tx, "settings.config.draft.updated", actor.id, id, { capabilityCode: row.capabilityCode, scopeId: row.scopeId, before: { version: row.version }, after: { version: updated.version, status: updated.status } });
      this.listCache.clear();
      return this.sanitize(updated);
    });
  }
  async validate(user: SettingsUser, id: string, requestId?: string) {
    const row = await this.prisma.settingsConfigVersion.findUnique({ where: { id } }); if (!row) throw new NotFoundException("配置版本不存在"); const { actor } = await this.access.assert(user, row.capabilityCode, "validate", row.scopeId);
    const errors: Record<string, string> = {}; if (row.effectiveAt && row.expiresAt && row.expiresAt <= row.effectiveAt) errors.effectiveAt = "结束时间必须晚于生效时间"; const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {}; if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) errors.payload = "配置内容必须是对象"; if (row.capabilityCode === "settings.security" && !row.effectiveAt) errors.effectiveAt = "安全策略必须明确填写生效时间"; const numberValue = (key: string) => Number(payload[key]); if (row.capabilityCode === "settings.security") { const sessionIdleMinutes = numberValue("sessionIdleMinutes"); const minPasswordLength = numberValue("minPasswordLength"); const maxLoginFailures = numberValue("maxLoginFailures"); const lockoutMinutes = numberValue("lockoutMinutes"); if (!Number.isFinite(sessionIdleMinutes) || sessionIdleMinutes < 5) errors.sessionIdleMinutes = "会话闲置时间不能少于 5 分钟"; if (!Number.isFinite(minPasswordLength) || minPasswordLength < 8) errors.minPasswordLength = "密码长度不能少于 8 位"; if (payload.requireAlphaNumeric !== true) errors.requireAlphaNumeric = "必须启用字母和数字组合"; if (!Number.isFinite(maxLoginFailures) || maxLoginFailures < 5) errors.maxLoginFailures = "失败锁定阈值不能少于 5 次"; if (!Number.isFinite(lockoutMinutes) || lockoutMinutes < 1) errors.lockoutMinutes = "锁定时长必须大于 0"; } if (row.capabilityCode === "store.capacity") { for (const key of ["inStoreCapacity", "outsideCapacity", "glassFilmCapacity", "reinspectionCapacity"]) { const value = numberValue(key); if (!Number.isFinite(value) || value < 0) errors[key] = "容量不能为负数且必须填写"; } } if (row.capabilityCode === "store.operations" && ["appointmentEnabled", "inventoryAlertEnabled", "constructionPhotoRequired", "smsReminderEnabled"].some((key) => payload[key] === false) && (typeof payload.disableReason !== "string" || !payload.disableReason.trim())) errors.disableReason = "关闭高风险业务开关必须填写原因"; if (row.capabilityCode === "settings.permissions" && (!payload.matrix || typeof payload.matrix !== "object" || Array.isArray(payload.matrix))) errors.matrix = "权限矩阵不能为空";
    if (row.capabilityCode === "finance.settlement") Object.assign(errors, validateFinanceSettlementPolicy(payload));
    const status = Object.keys(errors).length ? SettingsConfigStatus.VALIDATION_FAILED : SettingsConfigStatus.DRAFT;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.settingsConfigVersion.update({ where: { id }, data: { status, validationErrors: Object.keys(errors).length ? errors : Prisma.JsonNull, updatedById: actor.id, ...(requestId ? { requestId } : {}) } });
      await this.audit(tx, Object.keys(errors).length ? "settings.config.validation.failed" : "settings.config.validated", actor.id, id, { capabilityCode: row.capabilityCode, scopeId: row.scopeId, errors });
      this.listCache.clear();
      return { ...this.sanitize(updated), errors };
    });
  }
  async clone(user: SettingsUser, id: string) { const row = await this.prisma.settingsConfigVersion.findUnique({ where: { id } }); if (!row) throw new NotFoundException("配置版本不存在"); const { actor } = await this.access.assert(user, row.capabilityCode, "create", row.scopeId); return this.create(user, { domain: row.domain, capabilityCode: row.capabilityCode, scopeId: row.scopeId, payload: row.payload as Record<string, unknown>, effectiveAt: row.effectiveAt?.toISOString(), expiresAt: row.expiresAt?.toISOString() }); }
  async publish(user: SettingsUser, id: string, requestId?: string) {
    const row = await this.prisma.settingsConfigVersion.findUnique({ where: { id } }); if (!row) throw new NotFoundException("配置版本不存在"); const { actor } = await this.access.assert(user, row.capabilityCode, "publish", row.scopeId);
    if (requestId && row.status === SettingsConfigStatus.PUBLISHED && row.requestId === requestId) return this.sanitize(row);
    if (row.status !== SettingsConfigStatus.DRAFT) throw new ConflictException("请先通过服务端校验再发布"); const checked = await this.validate(user, id, undefined); if (Object.keys(checked.errors ?? {}).length) throw new ConflictException("配置校验失败，请修复后再发布");
    const existing = await this.prisma.settingsConfigVersion.findMany({ where: { id: { not: id }, capabilityCode: row.capabilityCode, scopeId: row.scopeId, status: SettingsConfigStatus.PUBLISHED } });
    const start = row.effectiveAt?.getTime() ?? Date.now(); const end = row.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (existing.some((item) => { const itemStart = item.effectiveAt?.getTime() ?? 0; const itemEnd = item.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY; return start < itemEnd && itemStart < end; })) throw new ConflictException("存在重叠生效时间的冲突版本");
    return this.prisma.$transaction(async (tx) => { const published = await tx.settingsConfigVersion.update({ where: { id }, data: { status: SettingsConfigStatus.PUBLISHED, publishedById: actor.id, publishedAt: new Date(), updatedById: actor.id, ...(requestId ? { requestId } : {}) } }); await this.audit(tx, "settings.config.published", actor.id, id, { capabilityCode: row.capabilityCode, scopeId: row.scopeId, after: { version: row.version, status: published.status } }); this.listCache.clear(); return this.sanitize(published); });
  }
  async withdraw(user: SettingsUser, id: string, reason: string, requestId?: string) {
    const row = await this.prisma.settingsConfigVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("配置版本不存在");
    const { actor } = await this.access.assert(user, row.capabilityCode, "publish", row.scopeId);
    if (requestId && row.status === SettingsConfigStatus.WITHDRAWN && row.requestId === requestId) return this.sanitize(row);
    if (row.status !== SettingsConfigStatus.PUBLISHED) throw new ConflictException("只有已发布版本可以撤回");
    return this.prisma.$transaction(async (tx) => {
      const withdrawn = await tx.settingsConfigVersion.update({ where: { id }, data: { status: SettingsConfigStatus.WITHDRAWN, updatedById: actor.id, ...(requestId ? { requestId } : {}) } });
      await this.audit(tx, "settings.config.withdrawn", actor.id, id, { capabilityCode: row.capabilityCode, scopeId: row.scopeId, before: { status: row.status, version: row.version }, after: { status: withdrawn.status }, reason: reason.trim() });
      this.listCache.clear();
      return this.sanitize(withdrawn);
    });
  }
  private sanitizePayload(payload: Prisma.JsonValue): Prisma.JsonValue {
    if (Array.isArray(payload)) return payload.map((item) => this.sanitizePayload(item));
    if (payload && typeof payload === "object") return Object.fromEntries(Object.entries(payload as Record<string, Prisma.JsonValue>).map(([key, value]) => /password|secret|token|accessKey|密钥|密码|令牌/i.test(key) ? [key, "********"] : [key, this.sanitizePayload(value)]));
    return payload;
  }
  private sanitize<T extends { payload: Prisma.JsonValue }>(row: T) {
    return { ...row, payload: this.sanitizePayload(row.payload) };
  }
  private audit(tx: Prisma.TransactionClient, action: string, actorId: string, targetId: string, metadata: Prisma.InputJsonValue) { return tx.auditEvent.create({ data: { action, actorId, targetType: "SettingsConfigVersion", targetId, storeId: typeof metadata === "object" && metadata && "scopeId" in metadata && typeof metadata.scopeId === "string" ? metadata.scopeId : null, metadata } }); }
}

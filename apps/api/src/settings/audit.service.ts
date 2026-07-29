import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsAccessService, type SettingsUser } from "./settings-access.service";

type AuditQuery = { action?: string; from?: string; to?: string; limit?: number; offset?: number; page?: number; pageSize?: number; domain?: string };

@Injectable()
export class SettingsAuditService {
  constructor(private readonly prisma: PrismaService, private readonly access: SettingsAccessService) {}

  async list(user: SettingsUser, input: AuditQuery) {
    const actor = await this.access.resolveUser(user);
    const canGlobal = Boolean(actor.isAuditor);
    if (!canGlobal && (!actor.storeMember || !["MANAGER", "FINANCE"].includes(actor.storeMember.position))) {
      throw new ForbiddenException("当前角色无权访问审计");
    }
    const requestedDomain = input.domain?.trim().toUpperCase();
    if (requestedDomain && !canGlobal && actor.storeMember?.position === "FINANCE" && requestedDomain !== "FINANCE") {
      throw new ForbiddenException("财务只能访问财务审计");
    }
    if (requestedDomain === "FINANCE" && !canGlobal && actor.storeMember?.position !== "FINANCE") {
      throw new ForbiddenException("当前角色无权访问财务审计");
    }
    if (!canGlobal && actor.storeMember?.position === "FINANCE" && !requestedDomain) {
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
    return { rows: rows.map((row) => ({ ...row, metadata: maskSensitive(row.metadata) })), total, limit, offset, page: Math.floor(offset / limit) + 1, pageSize: limit };
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
    await this.prisma.auditEvent.create({
      data: {
        action: "settings.audit.exported",
        actorId: actor.id,
        storeId: actor.isAuditor ? null : actor.storeMember?.storeId,
        targetType: "SettingsAuditExport",
        metadata: { count: rows.length, filters: input as Prisma.InputJsonValue }
      }
    });
    return { rows };
  }
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
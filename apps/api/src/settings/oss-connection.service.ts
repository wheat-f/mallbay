import { Injectable, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsAccessService, type SettingsUser } from "./settings-access.service";
import { TestOssConnectionDto } from "./dto/oss.dto";

@Injectable()
export class OssConnectionService {
  constructor(private readonly prisma: PrismaService, private readonly access: SettingsAccessService) {}

  async test(user: SettingsUser, scopeId: string | undefined, dto: TestOssConnectionDto) {
    const { actor, scopeId: resolvedScope } = await this.access.assert(user, "store.notifications", "edit", scopeId);
    if (!resolvedScope || (scopeId && resolvedScope !== scopeId)) throw new BadRequestException({ code: "SCOPE_UNRESOLVED", message: "必须明确一个可访问门店才能测试 OSS 连接" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(dto.endpoint, { method: "HEAD", signal: controller.signal, headers: dto.accessKey || dto.secretKey ? { ...(dto.accessKey ? { "X-OSS-Access-Key": dto.accessKey } : {}), ...(dto.secretKey ? { "X-OSS-Secret-Key": dto.secretKey } : {}) } : undefined });
      const result = { success: response.ok, status: response.status, message: response.ok ? "OSS 连接成功" : `OSS 返回 HTTP ${response.status}` };
      await this.prisma.auditEvent.create({ data: { action: result.success ? "settings.oss.connection.tested" : "settings.oss.connection.failed", actorId: actor.id, storeId: scopeId, targetType: "OssConnection", metadata: { endpoint: dto.endpoint, status: response.status, success: result.success } as Prisma.InputJsonValue } });
      if (!result.success) throw new BadRequestException(result.message);
      return result;
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "OSS 连接超时" : error instanceof Error ? error.message : "OSS 连接失败";
      if (!(error instanceof BadRequestException)) await this.prisma.auditEvent.create({ data: { action: "settings.oss.connection.failed", actorId: actor.id, storeId: scopeId, targetType: "OssConnection", metadata: { endpoint: dto.endpoint, message } as Prisma.InputJsonValue } });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(message);
    } finally { clearTimeout(timeout); }
  }
}

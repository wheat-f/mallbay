import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SettingsMigrationReviewStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsAccessService, type SettingsUser } from "./settings-access.service";
import { ResolveMigrationReviewDto } from "./dto/migration-review.dto";

@Injectable()
export class SettingsMigrationReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly access: SettingsAccessService) {}

  async list(user: SettingsUser, status?: string) {
    await this.access.assert(user, "settings.audit.global", "audit");
    const normalized = status && Object.values(SettingsMigrationReviewStatus).includes(status as SettingsMigrationReviewStatus) ? status as SettingsMigrationReviewStatus : undefined;
    return this.prisma.settingsMigrationReview.findMany({ where: normalized ? { status: normalized } : undefined, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async resolve(user: SettingsUser, id: string, dto: ResolveMigrationReviewDto) {
    const actor = await this.access.assert(user, "settings.audit.global", "audit");
    if (dto.status !== SettingsMigrationReviewStatus.RESOLVED && dto.status !== SettingsMigrationReviewStatus.IGNORED) throw new BadRequestException("迁移确认状态必须是 RESOLVED 或 IGNORED");
    const review = await this.prisma.settingsMigrationReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException("迁移确认项不存在");
    if (review.status !== SettingsMigrationReviewStatus.PENDING) return review;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.settingsMigrationReview.update({ where: { id }, data: { status: dto.status, resolvedById: actor.actor.id, resolvedAt: new Date() } });
      await tx.auditEvent.create({ data: { action: `settings.migration.review.${dto.status.toLowerCase()}`, actorId: actor.actor.id, targetType: "SettingsMigrationReview", targetId: id, metadata: { runId: review.runId, sourceType: review.sourceType, sourceId: review.sourceId, reason: dto.reason.trim(), status: dto.status } } });
      return updated;
    });
  }
}
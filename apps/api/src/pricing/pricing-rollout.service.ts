import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { PricingRolloutMode } from "@prisma/client";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { SetPricingRolloutDto } from "./dto/pricing-rollout.dto";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class PricingRolloutService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditLogService) {}

  async get(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) throw new ForbiddenException("无权限");
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, pricingRolloutMode: true } });
    if (!store) throw new NotFoundException("门店不存在");
    return store;
  }

  async set(user: PricingAuthenticatedUser, dto: SetPricingRolloutDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.isStoreManager(actor, dto.storeId)) throw new ForbiddenException("只有店长可以切换价格运行模式");
    const result = await this.prisma.store.update({ where: { id: dto.storeId }, data: { pricingRolloutMode: dto.mode }, select: { id: true, name: true, pricingRolloutMode: true } });
    await this.recordAudit({ action: "pricing_rollout_mode_changed", actorId: actor.id, targetType: "Store", targetId: dto.storeId, metadata: { storeId: dto.storeId, mode: dto.mode } });
    return result;
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async recordAudit(event: AuditEvent) {
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

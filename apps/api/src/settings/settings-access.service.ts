import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";
import { SETTINGS_CAPABILITIES, type SettingsAction, type SettingsCapability, type SettingsDomain } from "./settings-capabilities";

export type SettingsUser = { id: string; isAuditor?: boolean; storeMember?: { storeId: string; position: string } | null };
export type SettingsCapabilityView = SettingsCapability & { allowed: boolean; scopeId: string | null };

@Injectable()
export class SettingsAccessService {
  constructor(private readonly prisma: PrismaService, private readonly permissions?: PermissionsService) {}

  async resolveUser(user: SettingsUser) {
    if (user.storeMember !== undefined) return user;
    const storeMember = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { ...user, storeMember };
  }

  async getCapabilities(user: SettingsUser): Promise<SettingsCapabilityView[]> {
    const actor = await this.resolveUser(user);
    const visible: SettingsCapability[] = [];
    for (const capability of SETTINGS_CAPABILITIES) {
      if (await this.canUsePublishedPermission(actor, capability, "view")) visible.push(capability);
    }
    return visible.map((capability) => ({
      ...capability,
      allowed: true,
      scopeId: this.scopeId(actor, capability.domain)
    }));
  }

  async getSummary(user: SettingsUser) {
    const actor = await this.resolveUser(user);
    const capabilities = await this.getCapabilities(actor);
    const rows = await this.prisma.settingsConfigVersion.findMany({
      where: {
        capabilityCode: { in: capabilities.map((item) => item.code) },
        ...(actor.isAuditor ? {} : { scopeId: actor.storeMember?.storeId ?? actor.id })
      },
      orderBy: { updatedAt: "desc" }
    });
    const cards = capabilities.map((capability) => {
      const scoped = rows.filter((row) => row.capabilityCode === capability.code);
      const row = scoped[0];
      const pending = scoped.filter((item) => item.status === "DRAFT").length;
      const failed = scoped.filter((item) => item.status === "VALIDATION_FAILED").length;
      return { ...capability, status: failed ? "VALIDATION_FAILED" : pending ? "DRAFT" : row?.status ?? "NORMAL", pendingCount: pending, validationFailedCount: failed, version: row?.version ?? null, updatedAt: row?.updatedAt ?? null, updatedById: row?.updatedById ?? null };
    });
    return { cards, pendingCount: cards.reduce((sum, card) => sum + card.pendingCount, 0), validationFailedCount: cards.reduce((sum, card) => sum + card.validationFailedCount, 0) };
  }
  async assert(user: SettingsUser, code: string, action: SettingsAction, requestedScopeId?: string) {
    const actor = await this.resolveUser(user);
    const capability = SETTINGS_CAPABILITIES.find((item) => item.code === code);
    if (!capability || (this.permissions ? !(await this.canUsePublishedPermission(actor, capability, action)) : !this.canAction(actor, capability, action))) {
      throw new ForbiddenException("当前角色无权访问该设置");
    }
    const scopeId = this.scopeId(actor, capability.domain);
    const isHeadquartersRead = Boolean(actor.isAuditor) && (action === "view" || action === "audit") && (capability.domain === "STORE" || capability.domain === "FINANCE");
    if (capability.scope === "store" && requestedScopeId && requestedScopeId !== scopeId && !isHeadquartersRead) {
      throw new ForbiddenException("无权访问其他门店的设置");
    }
    return { actor, capability, scopeId: isHeadquartersRead ? (requestedScopeId ?? null) : scopeId };
  }

  private async canUsePublishedPermission(actor: Awaited<ReturnType<SettingsAccessService["resolveUser"]>>, capability: SettingsCapability, action: SettingsAction) {
    if (!this.permissions) return this.canAction(actor, capability, action);
    const permissionAction = action === "view" || action === "audit" ? "read" : "write";
    const storeId = capability.domain === "STORE" || capability.domain === "FINANCE" ? actor.storeMember?.storeId : undefined;
    return this.permissions.authorize(actor.id, "settings", permissionAction, { storeId });
  }

  private canView(actor: Awaited<ReturnType<SettingsAccessService["resolveUser"]>>, capability: SettingsCapability) {
    return this.canAction(actor, capability, "view");
  }

  private canAction(actor: Awaited<ReturnType<SettingsAccessService["resolveUser"]>>, capability: SettingsCapability, action: SettingsAction) {
    if (!capability.actions.includes(action)) return false;
    if (capability.domain === "HQ") return Boolean(actor.isAuditor);
    if (actor.isAuditor && (action === "view" || action === "audit") && (capability.domain === "STORE" || capability.domain === "FINANCE")) return true;
    if (capability.domain === "OWN") return true;
    if (!actor.storeMember) return false;
    if (capability.domain === "STORE") return actor.storeMember.position === "MANAGER";
    return actor.storeMember.position === "FINANCE";
  }

  private scopeId(actor: Awaited<ReturnType<SettingsAccessService["resolveUser"]>>, domain: SettingsDomain) {
    if (domain === "HQ") return "global";
    if (domain === "OWN") return actor.id;
    return actor.storeMember?.storeId ?? null;
  }
}

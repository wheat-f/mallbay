import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";
import { AccessContext, type AccessScopeFacts } from "../permissions/domain/access-context";
import { SETTINGS_CAPABILITY_PERMISSION } from "../permissions/permission-catalog";
import { SETTINGS_CAPABILITIES, type SettingsAction, type SettingsCapability } from "./settings-capabilities";

export type SettingsUser = { id: string; username?: string };
export type SettingsCapabilityView = SettingsCapability & { allowed: boolean; scopeId: string | null };

@Injectable()
export class SettingsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions?: PermissionsService,
    @Optional() private readonly accessContext?: AccessContext
  ) {}

  async getCapabilities(user: SettingsUser): Promise<SettingsCapabilityView[]> {
    const visible: SettingsCapability[] = [];
    for (const capability of SETTINGS_CAPABILITIES) {
      if ((await this.scopeFor(user, capability, "view")).allowed) visible.push(capability);
    }
    return visible.map((capability) => ({
      ...capability,
      allowed: true,
      scopeId: this.displayScopeId(user, capability)
    }));
  }

  async getScope(user: SettingsUser, code: string, action: SettingsAction = "view", requestedScopeId?: string) {
    const capability = SETTINGS_CAPABILITIES.find((item) => item.code === code);
    if (!capability || !capability.actions.includes(action)) return { allowed: false, global: false, storeIds: [], reason: "ACCESS_DENIED" as const };
    return this.scopeFor(user, capability, action, requestedScopeId);
  }

  async getSummary(user: SettingsUser) {
    const capabilities = await this.getCapabilities(user);
    const scopes = await Promise.all(capabilities.map(async (capability) => ({ capability, scope: await this.scopeFor(user, capability, "view") })));
    const global = scopes.some(({ scope }) => scope.global);
    const scopeIds = [...new Set(scopes.flatMap(({ scope }) => scope.storeIds))];
    const ownerIds = [...new Set(scopes.flatMap(({ scope }) => scope.ownerId ? [scope.ownerId] : []))];
    const visibleScopeIds = [...scopeIds, ...ownerIds];
    const rows = await this.prisma.settingsConfigVersion.findMany({
      where: {
        capabilityCode: { in: capabilities.map((item) => item.code) },
        ...(!global ? { scopeId: { in: visibleScopeIds.length ? visibleScopeIds : ["__NO_SCOPE__"] } } : {})
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
    const capability = SETTINGS_CAPABILITIES.find((item) => item.code === code);
    if (!capability || !capability.actions.includes(action)) {
      throw new ForbiddenException({ code: "ACCESS_DENIED", message: "当前角色无权访问该设置" });
    }
    const scope = await this.scopeFor(user, capability, action, requestedScopeId);
    if (!scope.allowed) {
      const message = scope.reason === "STORE_OUT_OF_SCOPE" ? "无权访问其他门店的设置" : "当前角色无权访问该设置";
      throw new ForbiddenException({ code: scope.reason ?? "ACCESS_DENIED", message });
    }
    return { actor: user, capability, scopeId: this.resolvedScopeId(user, capability, scope, requestedScopeId), scope };
  }

  private async scopeFor(user: SettingsUser, capability: SettingsCapability, action: SettingsAction, requestedScopeId?: string): Promise<AccessScopeFacts> {
    const permission = SETTINGS_CAPABILITY_PERMISSION[capability.code];
    const permissionAction = permission?.actionBySettingsAction[action];
    if (!permissionAction) return { allowed: false, global: false, storeIds: [], reason: "ACCESS_DENIED" };
    const context = {
      ...(requestedScopeId && capability.scope === "store" ? { storeId: requestedScopeId } : {}),
      ...(capability.scope === "own" ? { ownerId: user.id } : {})
    };
    return this.accessContext
      ? this.accessContext.scope({ userId: user.id }, permission.permissionCode, permissionAction, context)
      : this.permissions
        ? this.permissions.buildScopeFacts(user.id, permission.permissionCode, permissionAction, context)
        : { allowed: false, global: false, storeIds: [], reason: "ACCESS_DENIED" };
  }

  private displayScopeId(user: SettingsUser, capability: SettingsCapability) {
    if (capability.scope === "global") return "global";
    if (capability.scope === "own") return user.id;
    return null;
  }

  private resolvedScopeId(user: SettingsUser, capability: SettingsCapability, scope: AccessScopeFacts, requestedScopeId?: string) {
    if (requestedScopeId) return requestedScopeId;
    if (capability.scope === "global") return "global";
    if (capability.scope === "own") return user.id;
    return scope.global ? null : scope.storeIds.length === 1 ? scope.storeIds[0] : null;
  }
}

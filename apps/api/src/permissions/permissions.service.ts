import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PermissionBindingStatus, PermissionPolicyVersionStatus, PermissionRoleStatus, Prisma, PermissionScopeType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RuntimeAccessSnapshotStore } from "./domain/runtime-access-snapshot.store";
import type { AccessDenialReason, AccessScopeFacts } from "./domain/access-context";

export type PermissionContext = {
  storeId?: string;
  ownerId?: string;
};

export type PermissionResult = {
  userId: string;
  policyVersion: number;
  bindingVersion: number;
  roles: Array<{ roleCode: string; roleName: string; scopeType: PermissionScopeType; scopeIds: string[] }>;
  permissions: Array<{ code: string; actions: string[]; scopes: string[]; bindingScopes?: Array<{ scopeType: PermissionScopeType; scopeIds: string[] }> }>;
  generatedAt: string;
};

const legacyRoleNames: Record<string, string> = {
  MANAGER: "店长",
  SALES: "销售",
  CUSTOMER_SERVICE: "客服",
  PURCHASING: "采购",
  FINANCE: "财务",
  SCHEDULER: "排班员",
  CONSTRUCTION: "施工员",
  APPRENTICE: "学徒"
};

const legacyPermissionMap: Record<string, Array<[string, string, string]>> = {
    MANAGER: [
    ["customers", "read", "STORE"], ["customers", "write", "STORE"],
    ["orders", "read", "STORE"], ["orders", "write", "STORE"],
    ["orders.lifecycle", "finalize", "STORE"], ["orders.lifecycle", "cancel", "STORE"], ["orders.lifecycle", "cross_store_source_manage", "STORE"], ["orders.lifecycle", "verification_view", "STORE"], ["orders.lifecycle", "verification_resolve", "STORE"],
    ["warranties", "read", "STORE"], ["warranties", "write", "STORE"],
    ["construction", "read", "STORE"], ["construction", "write", "STORE"],
    ["inventory", "read", "STORE"], ["inventory", "write", "STORE"],
    ["products", "read", "STORE"], ["products", "write", "STORE"], ["products", "suggested-price-write", "STORE"],
    ["purchase", "read", "STORE"], ["purchase", "write", "STORE"],
    ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"],
    ["reports", "read", "STORE"],
    ["finance", "read", "STORE"], ["finance", "write", "STORE"],
    ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "read", "STORE"],
    ["finance.document", "attach", "OWN"], ["finance.document", "attach", "STORE"], ["finance.expense", "review", "STORE"],
    ["rebates", "read", "STORE"], ["rebates", "review", "STORE"], ["commissions", "write", "STORE"],
    ["returns", "write", "STORE"], ["returns", "create", "STORE"], ["returns", "manage", "STORE"], ["returns", "approve", "STORE"], ["returns", "finance", "STORE"],
    // A store manager owns the store-level configuration.  This permission is
    // also what authorizes dictionary reads used by customer vehicle forms.
    ["settings", "read", "STORE"], ["settings", "write", "STORE"]
  ],
  SALES: [["customers", "read", "OWN"], ["customers", "write", "OWN"], ["orders", "read", "OWN"], ["orders", "write", "OWN"], ["warranties", "read", "STORE"], ["products", "read", "STORE"], ["reports", "read", "STORE"], ["finance", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"], ["rebates", "read", "OWN"], ["rebates", "apply", "OWN"]],
  CUSTOMER_SERVICE: [["customers", "read", "STORE"], ["customers", "write", "STORE"], ["orders", "read", "STORE"], ["orders", "write", "STORE"], ["warranties", "read", "STORE"], ["warranties", "write", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"], ["finance", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"], ["rebates", "read", "STORE"], ["rebates", "apply", "STORE"]],
  PURCHASING: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["inventory", "read", "STORE"], ["inventory", "write", "STORE"], ["products", "read", "STORE"], ["purchase", "read", "STORE"], ["purchase", "write", "STORE"], ["after-sales", "read", "STORE"], ["finance", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]],
  FINANCE: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["finance", "read", "STORE"], ["finance", "write", "STORE"], ["finance.cost", "read", "STORE"], ["products", "read", "STORE"], ["reports", "read", "STORE"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "read", "STORE"], ["finance.document", "attach", "OWN"], ["finance.document", "attach", "STORE"], ["finance.reimbursement", "review", "STORE"], ["finance.reimbursement", "pay", "STORE"], ["rebates", "read", "STORE"], ["rebates", "pay", "STORE"], ["commissions", "write", "STORE"]],
  SCHEDULER: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["warranties", "write", "STORE"], ["construction", "read", "STORE"], ["construction", "write", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"], ["finance", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]],
  CONSTRUCTION: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["construction", "read", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "OWN"], ["finance", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]],
  APPRENTICE: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["construction", "read", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "OWN"], ["finance", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]]
};

@Injectable()
export class PermissionsService {
  private readonly resultCache = new Map<string, { expiresAt: number; result: PermissionResult }>();
  private readonly cacheTtlMs = 30_000;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeAccessSnapshotStore) private readonly snapshotStore: RuntimeAccessSnapshotStore
  ) {}

  async getForUser(userId: string, context: PermissionContext = {}): Promise<PermissionResult> {
    const cacheKey = userId + ":" + (context.storeId ?? "*");
    const cached = this.resultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.snapshotStore.set(userId, { permissions: cached.result.permissions, roles: cached.result.roles });
      return cached.result;
    }
    const now = new Date();
    const [user, bindings, published] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, storeMembers: { select: { storeId: true, position: true } } }
      }),
      this.prisma.permissionRoleBinding.findMany({
        where: {
          userId,
          status: PermissionBindingStatus.ACTIVE,
          effectiveAt: { lte: now },
          OR: [{ expiredAt: null }, { expiredAt: { gt: now } }]
        }
      }),
      this.prisma.permissionPolicyVersion.findFirst({
        where: { status: PermissionPolicyVersionStatus.PUBLISHED },
        orderBy: { version: "desc" }
      })
    ]);
    if (!user) throw new Error("用户不存在");

    const roles: PermissionResult["roles"] = [];
    const grants: Array<{
      code: string;
      action: string;
      scope: string;
      bindingScope: { scopeType: PermissionScopeType; scopeIds: string[] };
    }> = [];
    const scopedBindings = bindings;
    const roleIds = [...new Set(scopedBindings.map((binding) => binding.roleId))];
    const [roleRows, grantRows] = await Promise.all([
      roleIds.length
        ? this.prisma.permissionRole.findMany({ where: { id: { in: roleIds }, status: PermissionRoleStatus.ACTIVE } })
        : Promise.resolve([]),
      roleIds.length
        ? this.prisma.permissionRoleGrant.findMany({ where: { roleId: { in: roleIds } } })
        : Promise.resolve([])
    ]);
    const activeRoleIds = new Set(roleRows.map((role) => role.id));
    const roleById = new Map(roleRows.map((role) => [role.id, role]));
    for (const binding of scopedBindings) {
      if (!activeRoleIds.has(binding.roleId)) continue;
      const role = roleById.get(binding.roleId)!;
      const existing = roles.find((item) => item.roleCode === role.code && item.scopeType === binding.scopeType);
      if (existing) {
        if (binding.storeId && !existing.scopeIds.includes(binding.storeId)) existing.scopeIds.push(binding.storeId);
      } else {
        roles.push({
          roleCode: role.code,
          roleName: role.name,
          scopeType: binding.scopeType,
          scopeIds: binding.storeId ? [binding.storeId] : []
        });
      }
    }
    for (const grant of grantRows) {
      for (const binding of scopedBindings) {
        if (binding.roleId !== grant.roleId || !activeRoleIds.has(binding.roleId)) continue;
        grants.push({
          code: grant.permissionCode,
          action: grant.action,
          scope: grant.scope,
          bindingScope: {
            scopeType: binding.scopeType,
            scopeIds: binding.storeId ? [binding.storeId] : []
          }
        });
      }
    }

    if (bindings.length === 0) {
      this.addLegacyStorePermissions(grants, user.storeMembers, context);
      for (const member of user.storeMembers) {
        if (!context.storeId || context.storeId === member.storeId) {
          roles.push({ roleCode: member.position, roleName: legacyRoleNames[member.position] ?? member.position, scopeType: PermissionScopeType.STORE, scopeIds: [member.storeId] });
        }
      }
    }

    const mergedPermissions = new Map<string, {
      code: string;
      actions: Set<string>;
      scopes: Set<string>;
      bindingScopes: Map<string, { scopeType: PermissionScopeType; scopeIds: Set<string> }>;
    }>();
    for (const grant of grants) {
      const item = mergedPermissions.get(grant.code) ?? {
        code: grant.code,
        actions: new Set<string>(),
        scopes: new Set<string>(),
        bindingScopes: new Map()
      };
      item.actions.add(grant.action);
      item.scopes.add(grant.scope);
      const bindingKey = grant.bindingScope.scopeType + "|" + grant.bindingScope.scopeIds.join(",");
      const bindingScope = item.bindingScopes.get(bindingKey) ?? {
        scopeType: grant.bindingScope.scopeType,
        scopeIds: new Set<string>()
      };
      for (const scopeId of grant.bindingScope.scopeIds) bindingScope.scopeIds.add(scopeId);
      item.bindingScopes.set(bindingKey, bindingScope);
      mergedPermissions.set(grant.code, item);
    }
    const computedPermissions = [...mergedPermissions.values()].map((item) => ({
      code: item.code,
      actions: [...item.actions],
      scopes: [...item.scopes],
      bindingScopes: [...item.bindingScopes.values()].map((binding) => ({
        scopeType: binding.scopeType,
        scopeIds: [...binding.scopeIds]
      }))
    }));
    const result = {
      userId,
      policyVersion: published?.version ?? 0,
      bindingVersion: await this.bindingVersion(userId),
      roles,
      permissions: computedPermissions,
      generatedAt: now.toISOString()
    };
    this.resultCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, result });
    this.snapshotStore.set(userId, { permissions: computedPermissions, roles });
    return result;
  }

  async authorize(userId: string, permissionCode: string, action: string, context: PermissionContext = {}): Promise<boolean> {
    const result = await this.getForUser(userId);
    const scope = await this.buildScopeFacts(userId, permissionCode, action, context, result);
    const allowed = scope.allowed;
    if (!allowed && this.prisma.auditEvent?.create) {
      try {
        await this.prisma.auditEvent.create({
          data: {
            action: "permissions.access.denied",
            actorId: userId,
            targetType: "Permission",
            targetId: permissionCode,
            storeId: context.storeId ?? null,
            metadata: { permissionCode, action, ownerId: context.ownerId ?? null, policyVersion: result.policyVersion }
          }
        });
      } catch {
        // 权限拒绝不能因审计存储异常而变成 500；请求仍按默认拒绝处理。
      }
    }
    return allowed;
  }

  async buildScopeFacts(
    userId: string,
    permissionCode: string,
    action: string,
    context: PermissionContext = {},
    resolved?: PermissionResult
  ): Promise<AccessScopeFacts> {
    const result = resolved ?? await this.getForUser(userId);
    const resource = permissionCode.split(".")[0];
    const permissions = result.permissions.filter((item) =>
      (item.code === permissionCode || item.code === resource) && item.actions.includes(action)
    );
    if (permissions.length === 0) return { allowed: false, global: false, storeIds: [], reason: "ACCESS_DENIED" };

    const storeIds = new Set<string>();
    let global = false;
    let hasStoreGrant = false;
    let hasOwnGrant = false;
    for (const permission of permissions) {
      for (const binding of permission.bindingScopes ?? []) {
        if (permission.scopes.includes("GLOBAL") && binding.scopeType === PermissionScopeType.HQ) global = true;
        if (permission.scopes.includes("STORE")) {
          hasStoreGrant = true;
          for (const storeId of binding.scopeIds) storeIds.add(storeId);
        }
        if (permission.scopes.includes("OWN")) {
          hasOwnGrant = true;
          for (const storeId of binding.scopeIds) storeIds.add(storeId);
        }
      }
    }

    const requestedStoreIsKnown = context.storeId === undefined || global || storeIds.has(context.storeId);
    const storeAllowed = global || (context.storeId === undefined ? storeIds.size > 0 : storeIds.has(context.storeId));
    const ownOnlyRequest = hasOwnGrant && !hasStoreGrant;
    // An OWN-only capability cannot authorize an unspecified target. Callers
    // must provide the resource owner so list/detail mappings cannot silently
    // widen a personal scope into a store-wide query.
    const ownerAllowed = !ownOnlyRequest || context.ownerId === userId;
    const allowed = requestedStoreIsKnown && storeAllowed && (!ownOnlyRequest || ownerAllowed);
    let reason: AccessDenialReason | undefined;
    if (!allowed) {
      if (context.ownerId && ownOnlyRequest && !ownerAllowed) reason = "OWNER_OUT_OF_SCOPE";
      else if (context.storeId && !requestedStoreIsKnown) reason = "STORE_OUT_OF_SCOPE";
      else reason = "SCOPE_UNRESOLVED";
    }
    return {
      allowed,
      global,
      storeIds: [...storeIds].sort(),
      ...(!global && hasOwnGrant && !hasStoreGrant ? { ownerId: userId } : {}),
      ...(reason ? { reason } : {})
    };
  }
  private async applyPolicyPayload(tx: Prisma.TransactionClient, payload: Prisma.JsonValue) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const grants = (payload as { grants?: Array<{ roleCode: string; permissionCode: string; action: string; scope: string }> }).grants;
    if (!Array.isArray(grants)) return;
    await tx.permissionRoleGrant.deleteMany({});
    const grouped = new Map<string, Array<{ permissionCode: string; action: string; scope: string }>>();
    for (const grant of grants) {
      const list = grouped.get(grant.roleCode) ?? [];
      list.push({ permissionCode: grant.permissionCode, action: grant.action, scope: grant.scope });
      grouped.set(grant.roleCode, list);
    }
    for (const [roleCode, roleGrants] of grouped) {
      const role = await tx.permissionRole.findUnique({ where: { code: roleCode }, select: { id: true } });
      if (!role) continue;
      await tx.permissionRoleGrant.deleteMany({ where: { roleId: role.id } });
      await tx.permissionRoleGrant.createMany({ data: roleGrants.map((grant) => ({ roleId: role.id, ...grant })), skipDuplicates: true });
    }
  }

  async currentPolicy() {
    return this.prisma.permissionPolicyVersion.findFirst({ where: { status: PermissionPolicyVersionStatus.PUBLISHED }, orderBy: { version: "desc" } });
  }

  async createDraft(input: { payload: Prisma.InputJsonValue; actorId: string; expectedVersion?: number }) {
    const current = await this.currentPolicy();
    if (input.expectedVersion !== undefined && current && current.version !== input.expectedVersion) throw new Error("权限版本冲突");
    const existing = await this.prisma.permissionPolicyVersion.findFirst({ where: { status: PermissionPolicyVersionStatus.DRAFT } });
    if (existing) {
      const updated = await this.prisma.permissionPolicyVersion.update({ where: { id: existing.id }, data: { payload: input.payload, createdById: input.actorId } });
      await this.prisma.auditEvent.create({ data: { action: "permissions.policy.draft.saved", actorId: input.actorId, targetType: "PermissionPolicyVersion", targetId: updated.id, metadata: { version: updated.version } } });
      return updated;
    }
    const max = await this.prisma.permissionPolicyVersion.findFirst({ orderBy: { version: "desc" } });
    const created = await this.prisma.permissionPolicyVersion.create({
      data: { version: (max?.version ?? 0) + 1, status: PermissionPolicyVersionStatus.DRAFT, payload: input.payload, createdById: input.actorId }
    });
    await this.prisma.auditEvent.create({
      data: { action: "permissions.policy.draft.saved", actorId: input.actorId, targetType: "PermissionPolicyVersion", targetId: created.id, metadata: { version: created.version } }
    });
    return created;
  }

  async validatePolicy(id: string, actorId: string) {
    const policy = await this.prisma.permissionPolicyVersion.findUnique({ where: { id } });
    if (!policy || policy.status !== PermissionPolicyVersionStatus.DRAFT) throw new Error("只能校验草稿版本");
    const payload = policy.payload as { grants?: unknown } | null;
    const grants = payload && !Array.isArray(payload) && Array.isArray(payload.grants) ? payload.grants : null;
    const [definitions, roles] = await Promise.all([
      this.prisma.permissionDefinition.findMany({ where: { status: "ACTIVE" } }),
      this.prisma.permissionRole.findMany({ where: { status: "ACTIVE" } })
    ]);
    const definitionMap = new Map(definitions.map((item) => [item.code, item]));
    const roleCodes = new Set(roles.map((item) => item.code));
    const seen = new Set<string>();
    const valid = Boolean(grants) && grants!.every((item) => {
      if (!item || typeof item !== "object") return false;
      const grant = item as { roleCode?: unknown; permissionCode?: unknown; action?: unknown; scope?: unknown };
      if (typeof grant.roleCode !== "string" || typeof grant.permissionCode !== "string" || typeof grant.action !== "string" || typeof grant.scope !== "string") return false;
      const definition = definitionMap.get(grant.permissionCode);
      const key = [grant.roleCode, grant.permissionCode, grant.action, grant.scope].join("|");
      if (!definition || !roleCodes.has(grant.roleCode) || seen.has(key) || !definition.actions.includes(grant.action) || !definition.supportedScopes.includes(grant.scope)) return false;
      seen.add(key);
      return true;
    });
    const result = await this.prisma.permissionPolicyVersion.update({
      where: { id },
      data: { status: valid ? PermissionPolicyVersionStatus.VALIDATED : PermissionPolicyVersionStatus.VALIDATION_FAILED }
    });
    await this.prisma.auditEvent.create({
      data: { action: valid ? "permissions.policy.validated" : "permissions.policy.validation_failed", actorId, targetType: "PermissionPolicyVersion", targetId: id, metadata: { version: policy.version } }
    });
    return result;
  }

  async policyImpact(id: string) {
    const policy = await this.prisma.permissionPolicyVersion.findUnique({ where: { id } });
    if (!policy) throw new Error("权限版本不存在");
    const current = await this.currentPolicy();
    const nextGrants = this.extractPolicyGrants(policy.payload);
    const currentGrants = this.extractPolicyGrants(current?.payload);
    const currentKeys = new Set(currentGrants.map((grant) => `${grant.roleCode}|${grant.permissionCode}|${grant.action}|${grant.scope}`));
    const nextKeys = new Set(nextGrants.map((grant) => `${grant.roleCode}|${grant.permissionCode}|${grant.action}|${grant.scope}`));
    const changed = [...new Set([...currentKeys, ...nextKeys])].filter((key) => currentKeys.has(key) !== nextKeys.has(key));
    const roleCodes = [...new Set(changed.map((key) => key.split("|")[0]))];
    const roles = await this.prisma.permissionRole.findMany({ where: { code: { in: roleCodes } }, select: { id: true, code: true, name: true, status: true } });
    const roleIds = roles.map((role) => role.id);
    const bindings = await this.prisma.permissionRoleBinding.findMany({ where: { roleId: { in: roleIds }, status: PermissionBindingStatus.ACTIVE }, select: { userId: true, roleId: true, scopeType: true, storeId: true } });
    const userIds = [...new Set(bindings.map((binding) => binding.userId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, nickname: true } });
    const organizations = [...new Map(bindings.map((binding) => [binding.storeId ?? "HQ", { scopeType: binding.scopeType, storeId: binding.storeId }])).values()];
    const changedPermissions = [...new Set(changed.map((key) => key.split("|").slice(1).join("|")))];
    return {
      policyVersion: policy.version,
      comparedToVersion: current?.version ?? null,
      affectedRoles: roles,
      affectedUsers: users,
      affectedOrganizations: organizations,
      affectedMenus: changedPermissions.map((permission) => permission.split("|")[0]),
      affectedInterfaces: changedPermissions,
      revokedPermissions: changed.filter((key) => currentKeys.has(key) && !nextKeys.has(key)),
      grantedPermissions: changed.filter((key) => !currentKeys.has(key) && nextKeys.has(key)),
      affectedRoleCount: roles.length,
      affectedUserCount: users.length,
      affectedBindingCount: bindings.length,
      payload: policy.payload
    };
  }

  private extractPolicyGrants(payload: Prisma.JsonValue | null | undefined) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [] as Array<{ roleCode: string; permissionCode: string; action: string; scope: string }>;
    const grants = (payload as { grants?: unknown }).grants;
    if (!Array.isArray(grants)) return [];
    return grants.filter((grant): grant is { roleCode: string; permissionCode: string; action: string; scope: string } => {
      if (!grant || typeof grant !== "object") return false;
      const item = grant as Record<string, unknown>;
      return ["roleCode", "permissionCode", "action", "scope"].every((key) => typeof item[key] === "string");
    });
  }
  async publishPolicy(id: string, actorId: string, expectedVersion?: number) {
    const policy = await this.prisma.permissionPolicyVersion.findUnique({ where: { id } });
    if (!policy || policy.status !== PermissionPolicyVersionStatus.VALIDATED) throw new Error("只能发布已校验版本");
    if (expectedVersion !== undefined && policy.version !== expectedVersion) throw new Error("权限版本冲突");
    const nextGrants = this.extractPolicyGrants(policy.payload);
    const canManagePermissions = (roleCode: string) => nextGrants.some((grant) => grant.roleCode === roleCode && grant.permissionCode === "settings" && grant.action === "write" && grant.scope === "GLOBAL");
    const hqRole = await this.prisma.permissionRole.findUnique({ where: { code: "HQ_ADMIN" }, select: { id: true } });
    if (!hqRole || !canManagePermissions("HQ_ADMIN")) throw new Error("发布后必须保留总部管理员权限");
    const hqAdminCount = await this.prisma.permissionRoleBinding.count({ where: { roleId: hqRole.id, scopeType: PermissionScopeType.HQ, status: PermissionBindingStatus.ACTIVE } });
    if (hqAdminCount <= 0) throw new Error("不能发布会移除最后一个总部管理员的配置");
    const actorBindings = await this.prisma.permissionRoleBinding.findMany({ where: { userId: actorId, status: PermissionBindingStatus.ACTIVE }, select: { roleId: true } });
    const actorRoleIds = [...new Set(actorBindings.map((binding) => binding.roleId))];
    const actorRoles = await this.prisma.permissionRole.findMany({ where: { id: { in: actorRoleIds }, status: PermissionRoleStatus.ACTIVE }, select: { id: true, code: true } });
    const actorCanManage = actorRoles.some((role) => canManagePermissions(role.code));
    if (!actorCanManage) throw new Error("发布后当前操作者将失去权限发布能力");
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.permissionPolicyVersion.updateMany({ where: { status: PermissionPolicyVersionStatus.PUBLISHED }, data: { status: PermissionPolicyVersionStatus.ROLLED_BACK } });
      const published = await tx.permissionPolicyVersion.update({ where: { id }, data: { status: PermissionPolicyVersionStatus.PUBLISHED, publishedAt: new Date() } });
      await this.applyPolicyPayload(tx, policy.payload);
      await tx.auditEvent.create({
        data: { action: "permissions.policy.published", actorId, targetType: "PermissionPolicyVersion", targetId: id, metadata: { version: policy.version, impactSnapshotVersion: policy.version } }
      });
      return published;
    });
    this.invalidateAllCache();
    return result;
  }
  async rollbackPolicy(targetId: string, actorId: string) {
    const target = await this.prisma.permissionPolicyVersion.findUnique({ where: { id: targetId } });
    if (!target || target.status !== PermissionPolicyVersionStatus.PUBLISHED && target.status !== PermissionPolicyVersionStatus.ROLLED_BACK) throw new Error("目标版本不可回滚");
    const max = await this.prisma.permissionPolicyVersion.findFirst({ orderBy: { version: "desc" } });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.permissionPolicyVersion.updateMany({ where: { status: PermissionPolicyVersionStatus.PUBLISHED }, data: { status: PermissionPolicyVersionStatus.ROLLED_BACK } });
      const restored = await tx.permissionPolicyVersion.create({
        data: { version: (max?.version ?? 0) + 1, status: PermissionPolicyVersionStatus.PUBLISHED, payload: target.payload as Prisma.InputJsonValue, createdById: actorId, publishedAt: new Date() }
      });
      await this.applyPolicyPayload(tx, target.payload);
      await tx.auditEvent.create({
        data: { action: "permissions.policy.rolled_back", actorId, targetType: "PermissionPolicyVersion", targetId: restored.id, metadata: { sourceVersion: target.version, version: restored.version } }
      });
      return restored;
    });
    this.invalidateAllCache();
    return result;
  }

  async listRoles() {
    return this.prisma.permissionRole.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
  }

  async createRole(input: { code: string; name: string; description?: string; grants?: Array<{ permissionCode: string; action: string; scope: string }>; createdById: string }) {
    if (!input.code.trim() || !input.name.trim()) throw new Error("角色编码和名称不能为空");
    if (input.grants?.length) {
      const definitions = await this.prisma.permissionDefinition.findMany({ where: { code: { in: input.grants.map((grant) => grant.permissionCode) }, status: "ACTIVE" } });
      const definitionMap = new Map(definitions.map((definition) => [definition.code, definition]));
      const seen = new Set<string>();
      for (const grant of input.grants) {
        const definition = definitionMap.get(grant.permissionCode);
        const key = [grant.permissionCode, grant.action, grant.scope].join("|");
        if (!definition || !definition.actions.includes(grant.action) || !definition.supportedScopes.includes(grant.scope) || seen.has(key)) {
          throw new Error("角色权限项无效或重复");
        }
        seen.add(key);
      }
    }
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.permissionRole.create({
        data: { code: input.code, name: input.name, description: input.description, createdById: input.createdById }
      });
      if (input.grants?.length) {
        await tx.permissionRoleGrant.createMany({
          data: input.grants.map((grant) => ({ roleId: created.id, permissionCode: grant.permissionCode, action: grant.action, scope: grant.scope })),
          skipDuplicates: true
        });
      }
      await tx.auditEvent.create({
        data: { action: "permissions.role.created", actorId: input.createdById, targetType: "PermissionRole", targetId: created.id, metadata: { code: created.code } }
      });
      return created;
    });
    return this.prisma.permissionRole.findUnique({ where: { id: role.id } });
  }

  async listBindings(userId?: string) {
    const bindings = await this.prisma.permissionRoleBinding.findMany({ where: userId ? { userId } : undefined, orderBy: { createdAt: "desc" } });
    const roleIds = [...new Set(bindings.map((binding) => binding.roleId))];
    const userIds = [...new Set(bindings.map((binding) => binding.userId))];
    const [roles, users] = await Promise.all([
      this.prisma.permissionRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, code: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, nickname: true } })
    ]);
    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const userMap = new Map(users.map((user) => [user.id, user]));
    return bindings.map((binding) => ({ ...binding, role: roleMap.get(binding.roleId) ?? null, user: userMap.get(binding.userId) ?? null }));
  }

  async assertRoleBindingWriteAllowed(actorId: string, targetUserId: string, scopeType: PermissionScopeType) {
    const result = await this.getForUser(actorId);
    const isHeadquartersAdmin = result.roles.some((role) => role.roleCode === "HQ_ADMIN" && role.scopeType === PermissionScopeType.HQ);
    if (isHeadquartersAdmin && (targetUserId !== actorId || scopeType === PermissionScopeType.HQ)) {
      throw new ForbiddenException({
        code: "HQ_MEMBER_BINDING_DISABLED",
        message: "总部成员绑定暂未开放，请通过权限迁移脚本初始化总部管理员"
      });
    }
  }

  async assertExistingRoleBindingWriteAllowed(actorId: string, bindingId: string) {
    const binding = await this.prisma.permissionRoleBinding.findUnique({ where: { id: bindingId }, select: { userId: true, scopeType: true } });
    if (binding) await this.assertRoleBindingWriteAllowed(actorId, binding.userId, binding.scopeType);
  }

  async bindRole(input: { userId: string; roleId: string; scopeType: PermissionScopeType; storeId?: string; createdById: string }) {
    if (input.scopeType === PermissionScopeType.STORE && !input.storeId) throw new Error("门店范围绑定必须提供 storeId");
    if (input.scopeType === PermissionScopeType.HQ && input.storeId) throw new Error("总部范围绑定不能提供 storeId");
    const [target, role, existing] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
      this.prisma.permissionRole.findUnique({ where: { id: input.roleId } }),
      this.prisma.permissionRoleBinding.findFirst({ where: { userId: input.userId, roleId: input.roleId, scopeType: input.scopeType, storeId: input.storeId ?? null, status: PermissionBindingStatus.ACTIVE } })
    ]);
    if (!target) throw new Error("目标用户不存在");
    if (!role || role.status !== PermissionRoleStatus.ACTIVE) throw new Error("角色不存在或已停用");
    if (existing) throw new Error("相同角色和组织范围已绑定");
    const binding = await this.prisma.$transaction(async (tx) => {
      const created = await tx.permissionRoleBinding.create({ data: { userId: input.userId, roleId: input.roleId, scopeType: input.scopeType, storeId: input.storeId, createdById: input.createdById, effectiveAt: new Date() } });
      await tx.auditEvent.create({ data: { action: "permissions.binding.created", actorId: input.createdById, targetType: "PermissionRoleBinding", targetId: created.id, storeId: created.storeId, metadata: { userId: created.userId, roleId: created.roleId, scopeType: created.scopeType } } });
      return created;
    });
    this.invalidateUserCache(input.userId);
    return binding;
  }

  async disableBinding(bindingId: string, actorId: string) {
    const binding = await this.prisma.permissionRoleBinding.findUnique({ where: { id: bindingId } });
    if (!binding) throw new Error("角色绑定不存在");
    if (binding.status === PermissionBindingStatus.DISABLED) return binding;
    const updated = await this.prisma.$transaction(async (tx) => {
      const role = await tx.permissionRole.findUnique({ where: { id: binding.roleId }, select: { code: true } });
      if (role?.code === "HQ_ADMIN" && binding.scopeType === PermissionScopeType.HQ) {
        const count = await tx.permissionRoleBinding.count({ where: { roleId: binding.roleId, scopeType: PermissionScopeType.HQ, status: PermissionBindingStatus.ACTIVE } });
        if (count <= 1) throw new Error("不能移除最后一个总部管理员");
      }
      const next = await tx.permissionRoleBinding.update({ where: { id: bindingId }, data: { status: PermissionBindingStatus.DISABLED } });
      await tx.auditEvent.create({ data: { action: "permissions.binding.disabled", actorId, targetType: "PermissionRoleBinding", targetId: next.id, storeId: next.storeId, metadata: { userId: next.userId, roleId: next.roleId } } });
      return next;
    });
    this.invalidateUserCache(updated.userId);
    return updated;
  }

  async disableRole(roleId: string, actorId: string) {
    const role = await this.prisma.permissionRole.findUnique({ where: { id: roleId } });
    if (!role) throw new Error("角色不存在");
    if (role.type === "SYSTEM") throw new Error("系统角色不可停用");
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.permissionRole.update({ where: { id: roleId }, data: { status: PermissionRoleStatus.DISABLED } });
      await tx.permissionRoleBinding.updateMany({ where: { roleId, status: PermissionBindingStatus.ACTIVE }, data: { status: PermissionBindingStatus.DISABLED } });
      await tx.auditEvent.create({ data: { action: "permissions.role.disabled", actorId, targetType: "PermissionRole", targetId: roleId, metadata: { code: role.code } } });
      return next;
    });
    this.invalidateAllCache();
    return updated;
  }

  async listCatalog() {
    return this.prisma.permissionDefinition.findMany({ where: { status: "ACTIVE" }, orderBy: [{ resource: "asc" }, { code: "asc" }] });
  }

  private invalidateUserCache(userId: string) {
    for (const key of this.resultCache.keys()) if (key.startsWith(userId + ":")) this.resultCache.delete(key);
    this.snapshotStore.clear(userId);
    this.snapshotStore.clear(userId);
  }

  private invalidateAllCache() {
    this.resultCache.clear();
    this.snapshotStore.clearAll();
    this.snapshotStore.clearAll();
  }

  private async bindingVersion(userId: string) {
    const latest = await this.prisma.permissionRoleBinding.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
    return latest ? latest.updatedAt.getTime() : 0;
  }

  private addLegacyStorePermissions(
    grants: Array<{ code: string; action: string; scope: string; bindingScope: { scopeType: PermissionScopeType; scopeIds: string[] } }>,
    members: Array<{ storeId: string; position: string }>,
    context: PermissionContext
  ) {
    for (const member of members) {
      if (context.storeId && context.storeId !== member.storeId) continue;
      const mapped = legacyPermissionMap[member.position] ?? [];
      const returns = member.position === "MANAGER"
        ? [["write", "STORE"], ["create", "STORE"], ["manage", "STORE"], ["approve", "STORE"], ["finance", "STORE"]]
        : member.position === "SALES" || member.position === "CUSTOMER_SERVICE"
          ? [["write", "STORE"], ["create", "STORE"]]
          : member.position === "PURCHASING"
            ? [["write", "STORE"], ["manage", "STORE"]]
            : member.position === "FINANCE" ? [["write", "STORE"], ["finance", "STORE"]] : [];
      for (const [resource, action, scope] of [...mapped, ...returns.map(([action, scope]) => ["returns", action, scope] as [string, string, string])]) grants.push({ code: resource, action, scope, bindingScope: { scopeType: PermissionScopeType.STORE, scopeIds: [member.storeId] } });
    }
  }
}

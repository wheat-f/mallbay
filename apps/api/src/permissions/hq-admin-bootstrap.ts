import { PermissionRoleType, PermissionScopeType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const CONFIGURED_HQ_ADMIN_USERNAME = process.env.HQ_ADMIN_USERNAME?.trim();
export const FALLBACK_HQ_ADMIN_USERNAMES = ["zhouluoren", "xiaoming"] as const;

export const HEADQUARTERS_ADMIN_GRANTS = [
  ["customers", "read", "GLOBAL"], ["customers", "write", "GLOBAL"],
  ["orders", "read", "GLOBAL"], ["orders", "write", "GLOBAL"],
  ["warranties", "read", "GLOBAL"], ["warranties", "write", "GLOBAL"],
  ["construction", "read", "GLOBAL"], ["construction", "write", "GLOBAL"],
  ["products", "read", "GLOBAL"], ["products", "write", "GLOBAL"],
  ["inventory", "read", "GLOBAL"], ["inventory", "write", "GLOBAL"],
  ["purchase", "read", "GLOBAL"], ["purchase", "write", "GLOBAL"],
  ["finance", "read", "GLOBAL"], ["finance", "write", "GLOBAL"],
  ["finance.application", "submit", "GLOBAL"],
  ["finance.document", "read", "GLOBAL"], ["finance.document", "attach", "GLOBAL"],
  ["finance.expense", "review", "GLOBAL"],
  ["finance.reimbursement", "review", "GLOBAL"], ["finance.reimbursement", "pay", "GLOBAL"],
  ["after-sales", "read", "GLOBAL"], ["after-sales", "write", "GLOBAL"],
  ["reports", "read", "GLOBAL"], ["settings", "read", "GLOBAL"], ["settings", "write", "GLOBAL"],
  ["store", "read", "GLOBAL"], ["store", "write", "GLOBAL"],
  ["users", "read", "GLOBAL"], ["users", "write", "GLOBAL"]
] as const;

export function getHeadquartersAdminCandidates() {
  return CONFIGURED_HQ_ADMIN_USERNAME ? [CONFIGURED_HQ_ADMIN_USERNAME] : [...FALLBACK_HQ_ADMIN_USERNAMES];
}

export function pickHeadquartersAdminTarget<T extends { username: string }>(users: T[]) {
  const candidates = getHeadquartersAdminCandidates();
  return candidates.map((username) => users.find((user) => user.username === username)).find(Boolean) ?? null;
}

export async function ensureHeadquartersAdminRole(prisma: PrismaService) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.permissionRole.upsert({
      where: { code: "HQ_ADMIN" },
      update: { name: "总部管理员", type: PermissionRoleType.SYSTEM, status: "ACTIVE" },
      create: { code: "HQ_ADMIN", name: "总部管理员", type: PermissionRoleType.SYSTEM, status: "ACTIVE" }
    });

    const definitionActions = new Map<string, Set<string>>();
    for (const [permissionCode, action] of HEADQUARTERS_ADMIN_GRANTS) {
      const actions = definitionActions.get(permissionCode) ?? new Set<string>();
      actions.add(action);
      definitionActions.set(permissionCode, actions);
    }

    for (const [permissionCode, actions] of definitionActions) {
      await tx.permissionDefinition.upsert({
        where: { code: permissionCode },
        update: { actions: [...actions], supportedScopes: ["OWN", "STORE", "GLOBAL"], status: "ACTIVE" },
        create: {
          code: permissionCode,
          name: permissionCode,
          resource: permissionCode,
          actions: [...actions],
          supportedScopes: ["OWN", "STORE", "GLOBAL"]
        }
      });
    }

    for (const [permissionCode, action, scope] of HEADQUARTERS_ADMIN_GRANTS) {
      await tx.permissionRoleGrant.upsert({
        where: { roleId_permissionCode_action_scope: { roleId: role.id, permissionCode, action, scope } },
        update: {},
        create: { roleId: role.id, permissionCode, action, scope }
      });
    }

    return role;
  });
}

export async function assertBootstrapPreconditions(prisma: PrismaService) {
  const candidates = getHeadquartersAdminCandidates();
  const [role, targetUsers] = await Promise.all([
    prisma.permissionRole.findUnique({ where: { code: "HQ_ADMIN" }, select: { id: true } }),
    prisma.user.findMany({ where: { username: { in: candidates } }, select: { id: true, username: true, isActive: true } })
  ]);
  const selectedTarget = pickHeadquartersAdminTarget(targetUsers);
  if (!selectedTarget) {
    throw new Error(`HQ_ADMIN_TARGET_NOT_FOUND: 总部管理员目标账号不存在，可选账号：${candidates.join("、")}`);
  }
  if (selectedTarget.isActive === false) {
    throw new Error("HQ_ADMIN_TARGET_INACTIVE: 总部管理员目标账号已停用，请先人工启用");
  }
  if (!role) return;
  const conflicts = await prisma.permissionRoleBinding.findMany({
    where: { roleId: role.id, scopeType: PermissionScopeType.HQ, status: "ACTIVE" },
    select: { userId: true }
  });
  const conflictUserIds = conflicts.filter((item) => item.userId !== selectedTarget.id).map((item) => item.userId);
  const conflictUsers = conflictUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: conflictUserIds } }, select: { username: true } })
    : [];
  if (conflictUsers.length > 0) {
    throw new Error(`HQ_ADMIN_BINDING_CONFLICT: 已存在其他有效总部管理员 ${conflictUsers.map((item) => item.username).join(", ")}`);
  }
}

export async function ensureHeadquartersAdmin(prisma: PrismaService, roleId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('mallbay:hq-admin-bootstrap', 0))`;
    const candidates = getHeadquartersAdminCandidates();
    const [role, targetUsers] = await Promise.all([
      tx.permissionRole.findUnique({ where: { id: roleId }, select: { id: true, code: true, status: true } }),
      tx.user.findMany({ where: { username: { in: candidates } }, select: { id: true, username: true, isActive: true } })
    ]);
    const existingTarget = pickHeadquartersAdminTarget(targetUsers);
    const targetUsername = existingTarget?.username ?? candidates.join("、");
    if (!role || role.status !== "ACTIVE") throw new Error("HQ_ADMIN 角色不存在或已停用");
    if (!existingTarget) throw new Error(`HQ_ADMIN_TARGET_NOT_FOUND: 总部管理员目标账号不存在，可选账号：${targetUsername}`);
    if (existingTarget.isActive === false) throw new Error("HQ_ADMIN_TARGET_INACTIVE: 总部管理员目标账号已停用，请先人工启用");

    const activeBindings = await tx.permissionRoleBinding.findMany({
      where: { roleId: role.id, scopeType: PermissionScopeType.HQ, status: "ACTIVE" },
      select: { userId: true }
    });
    const conflictUserIds = activeBindings.filter((binding) => binding.userId !== existingTarget.id).map((binding) => binding.userId);
    if (conflictUserIds.length > 0) {
      const conflictUsers = await tx.user.findMany({ where: { id: { in: conflictUserIds } }, select: { username: true } });
      throw new Error(`HQ_ADMIN_BINDING_CONFLICT: 已存在其他有效总部管理员 ${conflictUsers.map((user) => user.username).join(", ")}`);
    }

    const existingBinding = await tx.permissionRoleBinding.findFirst({
      where: { userId: existingTarget.id, roleId: role.id, scopeType: PermissionScopeType.HQ, storeId: null },
      select: { id: true, status: true }
    });
    let bindingCreated = false;
    let bindingReactivated = false;
    let bindingId = existingBinding?.id ?? null;
    if (!existingBinding) {
      const binding = await tx.permissionRoleBinding.create({ data: { userId: existingTarget.id, roleId: role.id, scopeType: PermissionScopeType.HQ, storeId: null, status: "ACTIVE" } });
      bindingCreated = true;
      bindingId = binding.id;
    } else if (existingBinding.status === "DISABLED") {
      await tx.permissionRoleBinding.update({ where: { id: existingBinding.id }, data: { status: "ACTIVE", effectiveAt: new Date(), expiredAt: null } });
      bindingReactivated = true;
    }

    await tx.auditEvent.create({
      data: {
        action: "permissions.hq_admin.initialized",
        actorId: null,
        targetType: "User",
        targetId: existingTarget.id,
        metadata: { username: targetUsername, userCreated: false, bindingCreated, bindingReactivated, bindingId }
      }
    });
    return { userCreated: false, bindingCreated, bindingReactivated, username: targetUsername, userId: existingTarget.id, bindingId };
  });
}

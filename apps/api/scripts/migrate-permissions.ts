import { PermissionRoleType, PermissionScopeType, Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../src/prisma/prisma.service";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:55432/mallbay?schema=public";
const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));

const HQ_ADMIN_USERNAME = process.env.HQ_ADMIN_USERNAME?.trim();
const HQ_ADMIN_PASSWORD = process.env.HQ_ADMIN_PASSWORD;

function assertBootstrapConfiguration() {
  if (!HQ_ADMIN_USERNAME) {
    throw new Error("HQ_ADMIN_CONFIG_INVALID: HQ_ADMIN_USERNAME 必须由当前环境显式配置");
  }
}

async function assertBootstrapPreconditions() {
  assertBootstrapConfiguration();
  const [role, targetUser] = await Promise.all([
    prisma.permissionRole.findUnique({ where: { code: "HQ_ADMIN" }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: HQ_ADMIN_USERNAME }, select: { id: true, isActive: true } })
  ]);
  if (targetUser?.isActive === false) {
    throw new Error("HQ_ADMIN_TARGET_INACTIVE: 总部管理员目标账号已停用，请先人工启用");
  }
  if (!targetUser && !HQ_ADMIN_PASSWORD) {
    throw new Error("HQ_ADMIN_PASSWORD 未配置，无法创建总部管理员目标账号");
  }
  if (!role) return;
  const conflicts = await prisma.permissionRoleBinding.findMany({
    where: { roleId: role.id, scopeType: PermissionScopeType.HQ, status: "ACTIVE" },
    select: { userId: true }
  });
  const conflictUserIds = conflicts.filter((item) => item.userId !== targetUser?.id).map((item) => item.userId);
  const conflictUsers = conflictUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: conflictUserIds } }, select: { username: true } })
    : [];
  if (conflictUsers.length > 0) {
    throw new Error(`HQ_ADMIN_BINDING_CONFLICT: 已存在其他有效总部管理员 ${conflictUsers.map((item) => item.username).join(", ")}`);
  }
}

const roleDefinitions: Record<string, { name: string; grants: Array<[string, string, string]> }> = {
  HQ_ADMIN: {
    name: "总部管理员",
    grants: [
      ["customers", "read", "GLOBAL"], ["customers", "write", "GLOBAL"],
      ["orders", "read", "GLOBAL"], ["orders", "write", "GLOBAL"],
      ["warranties", "read", "GLOBAL"], ["warranties", "write", "GLOBAL"],
      ["construction", "read", "GLOBAL"], ["construction", "write", "GLOBAL"],
      ["products", "read", "GLOBAL"], ["products", "write", "GLOBAL"],
      ["inventory", "read", "GLOBAL"], ["inventory", "write", "GLOBAL"],
      ["purchase", "read", "GLOBAL"], ["purchase", "write", "GLOBAL"],
      ["finance", "read", "GLOBAL"], ["finance", "write", "GLOBAL"], ["finance.application", "submit", "GLOBAL"], ["finance.document", "read", "GLOBAL"], ["finance.document", "attach", "GLOBAL"], ["finance.expense", "review", "GLOBAL"], ["finance.reimbursement", "review", "GLOBAL"], ["finance.reimbursement", "pay", "GLOBAL"],
      ["after-sales", "read", "GLOBAL"], ["after-sales", "write", "GLOBAL"],
      ["reports", "read", "GLOBAL"], ["settings", "read", "GLOBAL"], ["settings", "write", "GLOBAL"]
    ]
  },
  MANAGER: { name: "店长", grants: [
    ["customers", "read", "STORE"], ["customers", "write", "STORE"], ["orders", "read", "STORE"], ["orders", "write", "STORE"], ["warranties", "read", "STORE"], ["warranties", "write", "STORE"],
    ["construction", "read", "STORE"], ["construction", "write", "STORE"], ["products", "read", "STORE"], ["products", "write", "STORE"], ["inventory", "read", "STORE"], ["inventory", "write", "STORE"],
    ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "read", "STORE"], ["finance.document", "attach", "OWN"], ["finance.document", "attach", "STORE"], ["finance.expense", "review", "STORE"],
    ["purchase", "read", "STORE"], ["purchase", "write", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"], ["reports", "read", "STORE"], ["settings", "read", "STORE"], ["settings", "write", "STORE"]
  ]},
  SALES: { name: "销售", grants: [["customers", "read", "OWN"], ["customers", "write", "OWN"], ["orders", "read", "OWN"], ["orders", "write", "OWN"], ["warranties", "read", "STORE"], ["products", "read", "STORE"], ["reports", "read", "STORE"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]] },
  CUSTOMER_SERVICE: { name: "客服", grants: [["customers", "read", "STORE"], ["customers", "write", "STORE"], ["orders", "read", "STORE"], ["orders", "write", "STORE"], ["warranties", "read", "STORE"], ["warranties", "write", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]] },
  PURCHASING: { name: "采购", grants: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["inventory", "read", "STORE"], ["inventory", "write", "STORE"], ["products", "read", "STORE"], ["products", "write", "STORE"], ["purchase", "read", "STORE"], ["purchase", "write", "STORE"], ["after-sales", "read", "STORE"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]] },
  FINANCE: { name: "财务", grants: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["finance", "read", "STORE"], ["finance", "write", "STORE"], ["products", "read", "STORE"], ["reports", "read", "STORE"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "read", "STORE"], ["finance.document", "attach", "OWN"], ["finance.document", "attach", "STORE"], ["finance.reimbursement", "review", "STORE"], ["finance.reimbursement", "pay", "STORE"]] },
  SCHEDULER: { name: "排班员", grants: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["warranties", "write", "STORE"], ["construction", "read", "STORE"], ["construction", "write", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]] },
  CONSTRUCTION: { name: "施工员", grants: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["construction", "read", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]] },
  APPRENTICE: { name: "学徒", grants: [["orders", "read", "STORE"], ["warranties", "read", "STORE"], ["construction", "read", "STORE"], ["products", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "OWN"], ["finance.application", "submit", "OWN"], ["finance.document", "read", "OWN"], ["finance.document", "attach", "OWN"]] }
};

for (const [code, definition] of Object.entries(roleDefinitions)) {
  definition.grants.unshift(["store", "read", code === "HQ_ADMIN" ? "GLOBAL" : "STORE"]);
  if (code === "MANAGER") definition.grants.push(["store", "write", "STORE"]);
  if (code === "HQ_ADMIN") definition.grants.push(["store", "write", "GLOBAL"], ["users", "read", "GLOBAL"], ["users", "write", "GLOBAL"]);
}

const definitions = Object.keys(roleDefinitions).length
  ? [...new Set(Object.values(roleDefinitions).flatMap((role) => role.grants.map(([resource]) => resource)))]
  : [];

async function ensureHeadquartersAdmin(roleId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('mallbay:hq-admin-bootstrap', 0))`;
    const targetUsername = HQ_ADMIN_USERNAME!;
    const [role, existingTarget] = await Promise.all([
      tx.permissionRole.findUnique({ where: { id: roleId }, select: { id: true, code: true, status: true } }),
      tx.user.findUnique({ where: { username: targetUsername }, select: { id: true, isActive: true } })
    ]);
    if (!role || role.status !== "ACTIVE") throw new Error("HQ_ADMIN 角色不存在或已停用");
    if (existingTarget?.isActive === false) throw new Error("HQ_ADMIN_TARGET_INACTIVE: 总部管理员目标账号已停用，请先人工启用");

    const activeBindings = await tx.permissionRoleBinding.findMany({
      where: { roleId: role.id, scopeType: PermissionScopeType.HQ, status: "ACTIVE" },
      select: { userId: true }
    });
    const conflictUserIds = activeBindings.filter((binding) => binding.userId !== existingTarget?.id).map((binding) => binding.userId);
    if (conflictUserIds.length > 0) {
      const conflictUsers = await tx.user.findMany({ where: { id: { in: conflictUserIds } }, select: { username: true } });
      throw new Error(`HQ_ADMIN_BINDING_CONFLICT: 已存在其他有效总部管理员 ${conflictUsers.map((user) => user.username).join(", ")}`);
    }

    let user = existingTarget;
    let userCreated = false;
    if (!user) {
      if (!HQ_ADMIN_PASSWORD) throw new Error("HQ_ADMIN_PASSWORD 未配置，无法创建总部管理员目标账号");
      user = await tx.user.create({ data: { username: targetUsername, passwordHash: await bcrypt.hash(HQ_ADMIN_PASSWORD, 12), isActive: true }, select: { id: true, isActive: true } });
      userCreated = true;
    }

    const existingBinding = await tx.permissionRoleBinding.findFirst({
      where: { userId: user.id, roleId: role.id, scopeType: PermissionScopeType.HQ, storeId: null },
      select: { id: true, status: true }
    });
    let bindingCreated = false;
    let bindingReactivated = false;
    let bindingId = existingBinding?.id ?? null;
    if (!existingBinding) {
      const binding = await tx.permissionRoleBinding.create({ data: { userId: user.id, roleId: role.id, scopeType: PermissionScopeType.HQ, storeId: null, status: "ACTIVE" } });
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
        targetId: user.id,
        metadata: { username: targetUsername, userCreated, bindingCreated, bindingReactivated, bindingId }
      }
    });
    return { userCreated, bindingCreated, bindingReactivated, userId: user.id, bindingId };
  });
}

async function main() {
  await assertBootstrapPreconditions();
  for (const resource of definitions) {
    await prisma.permissionDefinition.upsert({
      where: { code: resource },
      update: { status: "ACTIVE" },
      create: {
        code: resource,
        name: resource,
        resource,
        actions: resource === "finance.application" ? ["submit"] : resource === "finance.document" ? ["read", "attach"] : resource === "finance.expense" ? ["review"] : resource === "finance.reimbursement" ? ["review", "pay"] : ["read", "write"],
        supportedScopes: ["OWN", "STORE", "GLOBAL"]
      }
    });
  }

  const roleIds = new Map<string, string>();
  for (const [code, definition] of Object.entries(roleDefinitions)) {
    const role = await prisma.permissionRole.upsert({
      where: { code },
      update: { name: definition.name, type: PermissionRoleType.SYSTEM, status: "ACTIVE" },
      create: { code, name: definition.name, type: PermissionRoleType.SYSTEM }
    });
    roleIds.set(code, role.id);
    for (const [resource, action, scope] of definition.grants) {
      await prisma.permissionRoleGrant.upsert({
        where: { roleId_permissionCode_action_scope: { roleId: role.id, permissionCode: resource, action, scope } },
        update: {},
        create: { roleId: role.id, permissionCode: resource, action, scope }
      });
    }
  }

  const users = await prisma.user.findMany({ select: { id: true, storeMembers: { select: { storeId: true, position: true } } } });
  let created = 0;
  let skipped = 0;
  const createdDetails: unknown[] = [];
  const skippedDetails: unknown[] = [];
  const failedDetails: unknown[] = [];
  const unmappedDetails: unknown[] = [];
  for (const user of users) {
    const requested: Array<{ roleCode: string; scopeType: PermissionScopeType; storeId?: string }> = [];
    for (const member of user.storeMembers) requested.push({ roleCode: member.position, scopeType: PermissionScopeType.STORE, storeId: member.storeId });

    for (const binding of requested) {
      const roleId = roleIds.get(binding.roleCode);
      if (!roleId) {
        skipped++;
        unmappedDetails.push({ userId: user.id, roleCode: binding.roleCode, storeId: binding.storeId ?? null, reason: "岗位未映射到系统角色" });
        continue;
      }
      const existing = await prisma.permissionRoleBinding.findFirst({
        where: { userId: user.id, roleId, scopeType: binding.scopeType, storeId: binding.storeId ?? null }
      });
      if (existing) {
        skipped++;
        skippedDetails.push({ userId: user.id, roleCode: binding.roleCode, storeId: binding.storeId ?? null, bindingId: existing.id, reason: "已存在绑定" });
        continue;
      }
      try {
        const createdBinding = await prisma.permissionRoleBinding.create({ data: { userId: user.id, roleId, scopeType: binding.scopeType, storeId: binding.storeId } });
        created++;
        createdDetails.push({ userId: user.id, roleCode: binding.roleCode, storeId: binding.storeId ?? null, bindingId: createdBinding.id });
      } catch (error) {
        failedDetails.push({ userId: user.id, roleCode: binding.roleCode, storeId: binding.storeId ?? null, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  const hqAdminRoleId = roleIds.get("HQ_ADMIN");
  if (!hqAdminRoleId) throw new Error("HQ_ADMIN 角色初始化失败");
  const hqAdmin = await ensureHeadquartersAdmin(hqAdminRoleId);
  if (hqAdmin.userCreated) created++;
  if (hqAdmin.bindingCreated) created++;
  if (hqAdmin.bindingReactivated) skipped++;
  if (hqAdmin.bindingCreated || hqAdmin.bindingReactivated) {
    createdDetails.push({ userId: hqAdmin.userId, roleCode: "HQ_ADMIN", scopeType: PermissionScopeType.HQ, bindingId: hqAdmin.bindingId, action: hqAdmin.bindingReactivated ? "reactivated" : "created" });
  }
  const policyGrants = Object.entries(roleDefinitions).flatMap(([roleCode, definition]) => definition.grants.map(([permissionCode, action, scope]) => ({ roleCode, permissionCode, action, scope })));
  const policyPayload = { source: "legacy-migration", roleCodes: Object.keys(roleDefinitions), grants: policyGrants };
  const published = await prisma.permissionPolicyVersion.findFirst({ where: { status: "PUBLISHED" } });
  if (!published) {
    const version = await prisma.permissionPolicyVersion.count() + 1;
    await prisma.permissionPolicyVersion.create({
      data: { version, status: "PUBLISHED", publishedAt: new Date(), payload: policyPayload }
    });
  } else {
    await prisma.permissionPolicyVersion.update({ where: { id: published.id }, data: { payload: policyPayload } });
  }
  const report = { users: users.length, created, skipped, failed: failedDetails.length, unmapped: unmappedDetails.length, details: { created: createdDetails, skipped: skippedDetails, failed: failedDetails, unmapped: unmappedDetails } };
  await prisma.auditEvent.create({ data: { action: "permissions.migration.completed", actorId: null, targetType: "PermissionMigration", targetId: "initial", metadata: report as Prisma.InputJsonValue } });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

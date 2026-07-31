import { PermissionRoleType, PermissionScopeType, Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../src/prisma/prisma.service";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/mallbay?schema=public";
const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));

const roleDefinitions: Record<string, { name: string; grants: Array<[string, string, string]> }> = {
  HQ_ADMIN: {
    name: "总部管理员",
    grants: [
      ["customers", "read", "GLOBAL"], ["customers", "write", "GLOBAL"],
      ["orders", "read", "GLOBAL"], ["orders", "write", "GLOBAL"],
      ["construction", "read", "GLOBAL"], ["construction", "write", "GLOBAL"],
      ["inventory", "read", "GLOBAL"], ["inventory", "write", "GLOBAL"],
      ["purchase", "read", "GLOBAL"], ["purchase", "write", "GLOBAL"],
      ["finance", "read", "GLOBAL"], ["finance", "write", "GLOBAL"],
      ["after-sales", "read", "GLOBAL"], ["after-sales", "write", "GLOBAL"],
      ["reports", "read", "GLOBAL"], ["settings", "read", "GLOBAL"], ["settings", "write", "GLOBAL"]
    ]
  },
  MANAGER: { name: "店长", grants: [
    ["customers", "read", "STORE"], ["customers", "write", "STORE"], ["orders", "read", "STORE"], ["orders", "write", "STORE"],
    ["construction", "read", "STORE"], ["construction", "write", "STORE"], ["inventory", "read", "STORE"], ["inventory", "write", "STORE"],
    ["purchase", "read", "STORE"], ["purchase", "write", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"], ["reports", "read", "STORE"], ["settings", "read", "STORE"], ["settings", "write", "STORE"]
  ]},
  SALES: { name: "销售", grants: [["customers", "read", "OWN"], ["customers", "write", "OWN"], ["orders", "read", "OWN"], ["orders", "write", "OWN"]] },
  CUSTOMER_SERVICE: { name: "客服", grants: [["customers", "read", "STORE"], ["customers", "write", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "STORE"]] },
  PURCHASING: { name: "采购", grants: [["inventory", "read", "STORE"], ["inventory", "write", "STORE"], ["purchase", "read", "STORE"], ["purchase", "write", "STORE"]] },
  FINANCE: { name: "财务", grants: [["finance", "read", "STORE"], ["finance", "write", "STORE"], ["reports", "read", "STORE"]] },
  SCHEDULER: { name: "排班员", grants: [["construction", "read", "STORE"], ["construction", "write", "STORE"]] },
  CONSTRUCTION: { name: "施工员", grants: [["construction", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "OWN"]] },
  APPRENTICE: { name: "学徒", grants: [["construction", "read", "STORE"], ["after-sales", "read", "STORE"], ["after-sales", "write", "OWN"]] }
};

for (const [code, definition] of Object.entries(roleDefinitions)) {
  definition.grants.unshift(["store", "read", code === "HQ_ADMIN" ? "GLOBAL" : "STORE"]);
  if (code === "MANAGER") definition.grants.push(["store", "write", "STORE"]);
  if (code === "HQ_ADMIN") definition.grants.push(["store", "write", "GLOBAL"], ["users", "read", "GLOBAL"], ["users", "write", "GLOBAL"]);
}

const definitions = Object.keys(roleDefinitions).length
  ? [...new Set(Object.values(roleDefinitions).flatMap((role) => role.grants.map(([resource]) => resource)))]
  : [];

async function main() {
  for (const resource of definitions) {
    await prisma.permissionDefinition.upsert({
      where: { code: resource },
      update: { status: "ACTIVE" },
      create: { code: resource, name: resource, resource, actions: ["read", "write"], supportedScopes: ["OWN", "STORE", "GLOBAL"] }
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

  const users = await prisma.user.findMany({ select: { id: true, isAuditor: true, storeMembers: { select: { storeId: true, position: true } } } });
  let created = 0;
  let skipped = 0;
  const createdDetails: unknown[] = [];
  const skippedDetails: unknown[] = [];
  const failedDetails: unknown[] = [];
  const unmappedDetails: unknown[] = [];
  for (const user of users) {
    const requested: Array<{ roleCode: string; scopeType: PermissionScopeType; storeId?: string }> = [];
    if (user.isAuditor) requested.push({ roleCode: "HQ_ADMIN", scopeType: PermissionScopeType.HQ });
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

main().finally(() => prisma.$disconnect());

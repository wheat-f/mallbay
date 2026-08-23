import assert from "node:assert/strict";
import test from "node:test";
import { PermissionBindingStatus, PermissionPolicyVersionStatus } from "@prisma/client";
import { PermissionsService } from "./permissions.service";
import { RuntimeAccessSnapshotStore } from "./domain/runtime-access-snapshot.store";

function buildPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUnique: async () => ({ id: "u1", isAuditor: false, storeMembers: [] })
    },
    permissionRoleBinding: {
      findMany: async () => [
        { id: "b1", roleId: "r1", scopeType: "STORE", storeId: "s1" },
        { id: "b2", roleId: "r2", scopeType: "STORE", storeId: "s1" }
      ],
      findFirst: async () => ({ updatedAt: new Date("2026-01-01T00:00:00Z") })
    },
    permissionPolicyVersion: {
      findFirst: async () => ({ version: 4 })
    },
    permissionRole: {
      findMany: async () => [
        { id: "r1", code: "SALES", name: "销售" },
        { id: "r2", code: "FINANCE", name: "财务" }
      ]
    },
    permissionRoleGrant: {
      findMany: async () => [
        { roleId: "r1", permissionCode: "orders", action: "read", scope: "OWN" },
        { roleId: "r2", permissionCode: "finance", action: "read", scope: "STORE" }
      ]
    },
    ...overrides
  };
  return prisma;
}

function buildService(overrides: Record<string, unknown> = {}) {
  return new PermissionsService(buildPrisma(overrides) as never, new RuntimeAccessSnapshotStore());
}

test("multi-role permissions are unioned and scoped to the requested store", async () => {
  const service = buildService();
  assert.equal(await service.authorize("u1", "orders.read", "read", { storeId: "s1", ownerId: "u1" }), true);
  assert.equal(await service.authorize("u1", "finance.read", "read", { storeId: "s1" }), true);
  assert.equal(await service.authorize("u1", "orders.read", "read", { storeId: "s1", ownerId: "u2" }), false);
  assert.equal(await service.authorize("u1", "finance.read", "read", { storeId: "s2" }), false);
});

test("legacy users retain compatibility permissions before migration", async () => {
  const service = buildService({
    user: { findUnique: async () => ({ id: "u1", isAuditor: false, storeMembers: [{ storeId: "s1", position: "MANAGER" }] }) },
    permissionRoleBinding: {
      findMany: async () => [],
      findFirst: async () => null
    }
  });
  assert.equal(await service.authorize("u1", "orders.edit", "write", { storeId: "s1" }), true);
  assert.equal(await service.authorize("u1", "orders.edit", "write", { storeId: "s2" }), false);
});

test("legacy isAuditor users do not receive HQ permissions without an active HQ binding", async () => {
  const service = buildService({
    user: { findUnique: async () => ({ id: "auditor-1", isAuditor: true, storeMembers: [] }) },
    permissionRoleBinding: {
      findMany: async () => [],
      findFirst: async () => null
    },
    permissionRole: { findMany: async () => [] },
    permissionRoleGrant: { findMany: async () => [] }
  });
  const result = await service.getForUser("auditor-1");
  assert.equal(result.roles.some((role) => role.roleCode === "HQ_ADMIN"), false);
  assert.equal(await service.authorize("auditor-1", "settings", "read"), false);
});

test("HQ administrators cannot write other personnel or HQ role bindings", async () => {
  const service = buildService({
    user: { findUnique: async () => ({ id: "hq-1", isAuditor: false, storeMembers: [] }) },
    permissionRoleBinding: {
      findMany: async () => [{ id: "hq-binding", roleId: "hq-role", scopeType: "HQ", storeId: null }],
      findFirst: async () => null
    },
    permissionRole: { findMany: async () => [{ id: "hq-role", code: "HQ_ADMIN", name: "总部管理员" }] },
    permissionRoleGrant: { findMany: async () => [{ roleId: "hq-role", permissionCode: "settings", action: "write", scope: "GLOBAL" }] }
  });
  let otherUserError: unknown;
  try {
    await service.assertRoleBindingWriteAllowed("hq-1", "other-user", "STORE");
  } catch (error) {
    otherUserError = error;
  }
  assert.ok(otherUserError);
  assert.equal((otherUserError as { getResponse: () => { code?: string } }).getResponse().code, "HQ_MEMBER_BINDING_DISABLED");

  let headquartersScopeError: unknown;
  try {
    await service.assertRoleBindingWriteAllowed("hq-1", "hq-1", "HQ");
  } catch (error) {
    headquartersScopeError = error;
  }
  assert.ok(headquartersScopeError);
  assert.equal((headquartersScopeError as { getResponse: () => { code?: string } }).getResponse().code, "HQ_MEMBER_BINDING_DISABLED");
});

test("legacy finance capability matrix preserves submit, review, and payment boundaries", async () => {
  const createLegacyService = (position: string, userId: string) => buildService({
    user: {
      findUnique: async () => ({
        id: userId,
        isAuditor: false,
        storeMembers: [{ storeId: "s1", position }]
      })
    },
    permissionRoleBinding: {
      findMany: async () => [],
      findFirst: async () => null
    }
  });

  const managerService = createLegacyService("MANAGER", "manager-1");
  assert.equal(await managerService.authorize("manager-1", "finance.application", "submit", { storeId: "s1", ownerId: "manager-1" }), true);
  assert.equal(await managerService.authorize("manager-1", "finance.document", "read", { storeId: "s1" }), true);
  assert.equal(await managerService.authorize("manager-1", "finance.expense", "review", { storeId: "s1" }), true);
  assert.equal(await managerService.authorize("manager-1", "finance.reimbursement", "review", { storeId: "s1" }), false);

  const financeService = createLegacyService("FINANCE", "finance-1");
  assert.equal(await financeService.authorize("finance-1", "finance.document", "read", { storeId: "s1" }), true);
  assert.equal(await financeService.authorize("finance-1", "finance.reimbursement", "review", { storeId: "s1" }), true);
  assert.equal(await financeService.authorize("finance-1", "finance.reimbursement", "pay", { storeId: "s1" }), true);
  assert.equal(await financeService.authorize("finance-1", "finance.expense", "review", { storeId: "s1" }), false);

  const salesService = createLegacyService("SALES", "sales-1");
  assert.equal(await salesService.authorize("sales-1", "finance.application", "submit", { storeId: "s1", ownerId: "sales-1" }), true);
  assert.equal(await salesService.authorize("sales-1", "finance.document", "read", { storeId: "s1", ownerId: "sales-1" }), true);
  assert.equal(await salesService.authorize("sales-1", "finance.document", "read", { storeId: "s1" }), false);
});

test("permissions service populates the internal access snapshot store", async () => {
  const snapshotStore = new RuntimeAccessSnapshotStore();
  const service = new PermissionsService(buildPrisma() as never, snapshotStore);

  assert.equal(snapshotStore.has("u1"), false);
  assert.equal(await service.authorize("u1", "orders.read", "read", { storeId: "s1", ownerId: "u1" }), true);
  assert.equal(snapshotStore.has("u1"), true);
});

test("user-level permission mutations clear the internal runtime snapshot", async () => {
  const snapshotStore = new RuntimeAccessSnapshotStore();
  const prisma = buildPrisma({
    permissionRoleBinding: {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => ({ id: "b1", userId: "u1", roleId: "r1", scopeType: "STORE", storeId: "s1", status: "ACTIVE" }),
      update: async () => ({ id: "b1", userId: "u1", roleId: "r1", scopeType: "STORE", storeId: "s1", status: "DISABLED" })
    },
    permissionRole: {
      findMany: async () => [],
      findUnique: async () => ({ code: "SALES" })
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      permissionRole: { findUnique: async () => ({ code: "SALES" }) },
      permissionRoleBinding: {
        count: async () => 2,
        update: async () => ({ id: "b1", userId: "u1", roleId: "r1", scopeType: "STORE", storeId: "s1", status: "DISABLED" })
      },
      auditEvent: { create: async () => ({ id: "audit-1" }) }
    }),
    auditEvent: { create: async () => ({ id: "audit-1" }) }
  });
  const permissionsService = new PermissionsService(prisma as never, snapshotStore);
  snapshotStore.set("u1", { roles: [{ scopeType: "STORE", scopeIds: ["s1"] }], permissions: [] });
  assert.equal(snapshotStore.has("u1"), true);

  await permissionsService.disableBinding("b1", "admin-1");

  assert.equal(snapshotStore.has("u1"), false);
});

test("global permission mutations clear all internal runtime snapshots", async () => {
  const snapshotStore = new RuntimeAccessSnapshotStore();
  const prisma = buildPrisma({
    permissionRole: {
      findMany: async () => [],
      findUnique: async () => ({ id: "role-1", code: "CUSTOM", type: "CUSTOM" })
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      permissionRole: { update: async () => ({ id: "role-1", status: "DISABLED" }) },
      permissionRoleBinding: { updateMany: async () => ({ count: 1 }) },
      auditEvent: { create: async () => ({ id: "audit-1" }) }
    }),
  });
  const permissionsService = new PermissionsService(prisma as never, snapshotStore);
  snapshotStore.set("u1", { roles: [], permissions: [] });
  snapshotStore.set("u2", { roles: [], permissions: [] });

  await permissionsService.disableRole("role-1", "admin-1");

  assert.equal(snapshotStore.has("u1"), false);
  assert.equal(snapshotStore.has("u2"), false);
});

test("publishing a validated policy clears all internal runtime snapshots", async () => {
  const snapshotStore = new RuntimeAccessSnapshotStore();
  const payload = {
    grants: [{ roleCode: "HQ_ADMIN", permissionCode: "settings", action: "write", scope: "GLOBAL" }]
  };
  const tx = {
    permissionPolicyVersion: {
      updateMany: async () => ({ count: 1 }),
      update: async () => ({ id: "policy-1", version: 2, status: PermissionPolicyVersionStatus.PUBLISHED })
    },
    permissionRoleGrant: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async () => ({ count: 1 })
    },
    permissionRole: { findUnique: async () => ({ id: "role-hq" }) },
    auditEvent: { create: async () => ({ id: "audit-1" }) }
  };
  const service = new PermissionsService({
    permissionPolicyVersion: {
      findUnique: async () => ({ id: "policy-1", version: 2, status: PermissionPolicyVersionStatus.VALIDATED, payload })
    },
    permissionRole: {
      findUnique: async () => ({ id: "role-hq" }),
      findMany: async () => [{ id: "role-hq", code: "HQ_ADMIN" }]
    },
    permissionRoleBinding: {
      count: async () => 1,
      findMany: async () => [{ roleId: "role-hq" }]
    },
    user: { findUnique: async () => ({ isAuditor: false }) },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(tx)
  } as never, snapshotStore);
  snapshotStore.set("u1", { roles: [], permissions: [] });
  snapshotStore.set("u2", { roles: [], permissions: [] });

  await service.publishPolicy("policy-1", "admin-1", 2);

  assert.equal(snapshotStore.has("u1"), false);
  assert.equal(snapshotStore.has("u2"), false);
});

test("rolling back a policy clears all internal runtime snapshots", async () => {
  const snapshotStore = new RuntimeAccessSnapshotStore();
  const payload = {
    grants: [{ roleCode: "HQ_ADMIN", permissionCode: "settings", action: "write", scope: "GLOBAL" }]
  };
  const service = new PermissionsService({
    permissionPolicyVersion: {
      findUnique: async () => ({ id: "policy-1", version: 1, status: PermissionPolicyVersionStatus.PUBLISHED, payload }),
      findFirst: async () => ({ version: 3 }),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      permissionPolicyVersion: {
        updateMany: async () => ({ count: 1 }),
        create: async () => ({ id: "policy-4", version: 4, status: PermissionPolicyVersionStatus.PUBLISHED })
      },
      permissionRoleGrant: {
        deleteMany: async () => ({ count: 1 }),
        createMany: async () => ({ count: 1 })
      },
      permissionRole: { findUnique: async () => ({ id: "role-hq" }) },
      auditEvent: { create: async () => ({ id: "audit-1" }) }
    })
  } as never, snapshotStore);
  snapshotStore.set("u1", { roles: [], permissions: [] });
  snapshotStore.set("u2", { roles: [], permissions: [] });

  await service.rollbackPolicy("policy-1", "admin-1");

  assert.equal(snapshotStore.has("u1"), false);
  assert.equal(snapshotStore.has("u2"), false);
});


test("does not combine grant and binding scopes across roles", async () => {
  const service = buildService({
    permissionRoleBinding: {
      findMany: async () => [
        { id: "b1", roleId: "r1", scopeType: "STORE", storeId: "s1" },
        { id: "b2", roleId: "r2", scopeType: "STORE", storeId: "s2" }
      ],
      findFirst: async () => ({ updatedAt: new Date("2026-01-01T00:00:00Z") })
    },
    permissionRoleGrant: {
      findMany: async () => [
        { roleId: "r1", permissionCode: "inventory", action: "read", scope: "STORE" },
        { roleId: "r2", permissionCode: "finance", action: "read", scope: "STORE" }
      ]
    }
  });
  assert.equal(await service.authorize("u1", "inventory.read", "read", { storeId: "s1" }), true);
  assert.equal(await service.authorize("u1", "inventory.read", "read", { storeId: "s2" }), false);
  assert.equal(await service.authorize("u1", "finance.read", "read", { storeId: "s2" }), true);
});

test("buildScopeFacts returns canonical store and owner facts without a query shape", async () => {
  const service = buildService();
  const facts = await service.buildScopeFacts("u1", "orders.read", "read", { storeId: "s1", ownerId: "u1" });

  assert.deepEqual(facts, {
    allowed: true,
    global: false,
    storeIds: ["s1"],
    ownerId: "u1"
  });
  assert.equal("where" in facts, false);
  assert.equal("scopes" in facts, false);
});

test("buildScopeFacts distinguishes explicit store and owner failures", async () => {
  const service = buildService();

  assert.deepEqual(await service.buildScopeFacts("u1", "orders.read", "read", { storeId: "s2", ownerId: "u1" }), {
    allowed: false,
    global: false,
    storeIds: ["s1"],
    ownerId: "u1",
    reason: "STORE_OUT_OF_SCOPE"
  });
  assert.deepEqual(await service.buildScopeFacts("u1", "orders.read", "read", { storeId: "s1", ownerId: "u2" }), {
    allowed: false,
    global: false,
    storeIds: ["s1"],
    ownerId: "u1",
    reason: "OWNER_OUT_OF_SCOPE"
  });
});

test("HQ GLOBAL facts are global and do not depend on a requested store", async () => {
  const service = buildService({
    permissionRoleBinding: {
      findMany: async () => [{ id: "hq-binding", roleId: "hq-role", scopeType: "HQ", storeId: null }],
      findFirst: async () => ({ updatedAt: new Date("2026-01-01T00:00:00Z") })
    },
    permissionRole: { findMany: async () => [{ id: "hq-role", code: "HQ_ADMIN", name: "总部管理员" }] },
    permissionRoleGrant: { findMany: async () => [{ roleId: "hq-role", permissionCode: "settings", action: "read", scope: "GLOBAL" }] }
  });

  assert.deepEqual(await service.buildScopeFacts("u1", "settings", "read", { storeId: "s99" }), {
    allowed: true,
    global: true,
    storeIds: []
  });
});

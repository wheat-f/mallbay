import assert from "node:assert/strict";
import test from "node:test";
import { PermissionsService } from "./permissions.service";

function buildService(overrides: Record<string, unknown> = {}) {
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
  return new PermissionsService(prisma as never);
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

test("runtime policy bridge rejects a store outside the binding scope", async () => {
  const { PermissionPolicy } = await import("../common/policies/permission.policy");
  PermissionPolicy.setRuntimeSnapshot("u1", {
    roles: [{ scopeType: "STORE", scopeIds: ["s1"] }],
    permissions: [{ code: "inventory", actions: ["read"], scopes: ["STORE"] }]
  });
  const actor = { id: "u1", isAuditor: false, storeMember: { storeId: "s1", position: "MANAGER" as never } };
  assert.equal(PermissionPolicy.canViewInventory(actor, "s1"), true);
  assert.equal(PermissionPolicy.canViewInventory(actor, "s2"), false);
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
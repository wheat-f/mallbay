import assert from "node:assert/strict";
import { test } from "node:test";
import { getActiveManagementMenuKey, getManagementMenuGroups, getManagementMenuItems, hasAnySettingsReadPermission } from "./management-menu";

const storeBinding = { scopeType: "STORE" as const, scopeIds: ["store-1"] };
const managerPermissions = [
  { code: "customers", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "orders", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "products", actions: ["read", "write", "suggested-price-write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "construction", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "inventory", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "purchase", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "warranties", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "after-sales", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "finance", actions: ["read"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "finance.application", actions: ["submit"], scopes: ["OWN"], bindingScopes: [storeBinding] },
  { code: "reports", actions: ["read"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "store.members", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] },
  { code: "store.dictionary", actions: ["read", "write"], scopes: ["STORE"], bindingScopes: [storeBinding] }
];

test("management menu is empty until the runtime permission snapshot loads", () => {
  assert.deepEqual(getManagementMenuItems({ storeId: "store-1" }), []);
});

test("management menu consumes effective permissions instead of a position", () => {
  const labels = getManagementMenuItems({ storeId: "store-1", permissions: managerPermissions }).map((item) => item.label);

  assert.equal(labels.includes("工作台"), true);
  assert.equal(labels.includes("客户管理"), true);
  assert.equal(labels.includes("建议价设置"), true);
  assert.equal(labels.includes("人员管理"), true);
  assert.equal(labels.includes("系统设置"), true);
  assert.equal(labels.includes("门店审核"), false);
});

test("global administration is visible only with the global store capability", () => {
  const labels = getManagementMenuItems({
    permissions: [{ code: "store", actions: ["read"], scopes: ["GLOBAL"], bindingScopes: [{ scopeType: "HQ", scopeIds: [] }] }]
  }).map((item) => item.label);

  assert.equal(labels.includes("门店审核"), true);
  assert.equal(labels.includes("系统设置"), false);
});

test("settings menu requires a specific settings capability", () => {
  assert.equal(hasAnySettingsReadPermission([{ code: "settings.dictionary", actions: ["read"], scopes: ["GLOBAL"], bindingScopes: [{ scopeType: "HQ", scopeIds: [] }] }]), true);
  assert.equal(hasAnySettingsReadPermission([{ code: "settings.dictionary", actions: ["read"], scopes: ["STORE"], bindingScopes: [storeBinding] }], "store-1"), false);
  assert.equal(hasAnySettingsReadPermission([{ code: "orders", actions: ["read"], scopes: ["STORE"], bindingScopes: [storeBinding] }], "store-1"), false);
});

test("management menu groups only contain permission-authorized items", () => {
  const groups = getManagementMenuGroups({ storeId: "store-1", permissions: managerPermissions });
  assert.equal(groups.some((group) => group.items.length === 0), false);
  assert.deepEqual(groups.find((group) => group.key === "people-system")?.items.map((item) => item.label), ["人员管理", "系统设置"]);
});

test("active management menu key follows route groups", () => {
  assert.equal(getActiveManagementMenuKey("/orders/create"), "orders");
  assert.equal(getActiveManagementMenuKey("/orders/pricing"), "pricing");
  assert.equal(getActiveManagementMenuKey("/construction/leave-approvals"), "construction-leave-approvals");
  assert.equal(getActiveManagementMenuKey("/settings"), "settings");
});

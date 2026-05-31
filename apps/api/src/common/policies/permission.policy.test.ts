import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { PermissionPolicy } from "./permission.policy";

const admin = { id: "admin-1", isAuditor: true, storeMember: null };
const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
};
const sales = {
  id: "sales-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.SALES }
};
const finance = {
  id: "finance-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
};
const worker = {
  id: "worker-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
};

test("PermissionPolicy treats isAuditor as administrator", () => {
  assert.equal(PermissionPolicy.isAdmin(admin), true);
  assert.equal(PermissionPolicy.canViewStoreData(admin, "store-2"), true);
});

test("PermissionPolicy treats MANAGER as store manager for the same store", () => {
  assert.equal(PermissionPolicy.isStoreManager(manager, "store-1"), true);
  assert.equal(PermissionPolicy.isStoreManager(manager, "store-2"), false);
});

test("PermissionPolicy scopes sales to owned customers and orders", () => {
  assert.equal(PermissionPolicy.canViewCustomer(sales, "store-1", "sales-1"), true);
  assert.equal(PermissionPolicy.canViewCustomer(sales, "store-1", "sales-2"), false);
  assert.deepEqual(PermissionPolicy.getOrderScope(sales, "store-1"), {
    storeId: "store-1",
    salesPersonId: "sales-1"
  });
});

test("PermissionPolicy allows finance to manage payments but not customer edits", () => {
  assert.equal(PermissionPolicy.canManageOrderPayment(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canEditCustomer(finance, "store-1", "sales-1"), false);
});

test("PermissionPolicy limits construction workers to assigned work", () => {
  assert.equal(PermissionPolicy.canCreateOrder(worker, "store-1"), false);
  assert.deepEqual(PermissionPolicy.getOrderScope(worker, "store-1"), {
    storeId: "store-1",
    assignedWorkerId: "worker-1"
  });
});

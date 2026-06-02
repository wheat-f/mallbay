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
const purchasing = {
  id: "purchasing-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
};
const worker = {
  id: "worker-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
};
const apprentice = {
  id: "apprentice-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.APPRENTICE }
};
const scheduler = {
  id: "scheduler-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
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

test("PermissionPolicy allows schedulers managers and admins to dispatch construction", () => {
  assert.equal(PermissionPolicy.canDispatchConstruction(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canDispatchConstruction(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canDispatchConstruction(scheduler, "store-1"), true);
  assert.equal(PermissionPolicy.canDispatchConstruction(scheduler, "store-2"), false);
  assert.equal(PermissionPolicy.canDispatchConstruction(worker, "store-1"), false);
});

test("PermissionPolicy allows assigned workers and apprentices to work on construction tasks", () => {
  assert.equal(PermissionPolicy.canWorkOnConstructionTask(worker, "store-1", "worker-1"), true);
  assert.equal(PermissionPolicy.canWorkOnConstructionTask(apprentice, "store-1", "apprentice-1"), true);
  assert.equal(PermissionPolicy.canWorkOnConstructionTask(worker, "store-1", "other-worker"), false);
  assert.equal(PermissionPolicy.canWorkOnConstructionTask(scheduler, "store-1", "worker-1"), false);
});

test("PermissionPolicy scopes construction photo upload and quality check", () => {
  assert.equal(PermissionPolicy.canUploadConstructionPhoto(worker, "store-1", "worker-1"), true);
  assert.equal(PermissionPolicy.canUploadConstructionPhoto(worker, "store-2", "worker-1"), false);
  assert.equal(PermissionPolicy.canQualityCheckConstruction(scheduler, "store-1"), true);
  assert.equal(PermissionPolicy.canQualityCheckConstruction(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canQualityCheckConstruction(worker, "store-1"), false);
});

test("PermissionPolicy scopes inventory and warranty operations", () => {
  assert.equal(PermissionPolicy.canManageInventory(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canManageInventory(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canManageInventory(purchasing, "store-1"), true);
  assert.equal(PermissionPolicy.canManageInventory(purchasing, "store-2"), false);
  assert.equal(PermissionPolicy.canManageInventory(sales, "store-1"), false);

  assert.equal(PermissionPolicy.canCreateWarranty(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canCreateWarranty(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canCreateWarranty(scheduler, "store-1"), true);
  assert.equal(PermissionPolicy.canCreateWarranty(finance, "store-1"), false);
});

test("PermissionPolicy scopes after-sales and commission operations", () => {
  assert.equal(PermissionPolicy.canManageAfterSales(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canManageAfterSales(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canManageAfterSales(scheduler, "store-1"), true);
  assert.equal(PermissionPolicy.canManageAfterSales(worker, "store-1"), false);

  assert.equal(PermissionPolicy.canManageCommission(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canManageCommission(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canManageCommission(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canManageCommission(sales, "store-1"), false);
});

test("PermissionPolicy scopes finance invoice rebate and report operations", () => {
  assert.equal(PermissionPolicy.canManageFinance(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canManageFinance(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canManageFinance(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canManageFinance(sales, "store-1"), false);

  assert.equal(PermissionPolicy.canApplyInvoice(sales, "store-1"), true);
  assert.equal(PermissionPolicy.canManageInvoice(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canManageInvoice(scheduler, "store-1"), false);

  assert.equal(PermissionPolicy.canApplyRebate(sales, "store-1"), true);
  assert.equal(PermissionPolicy.canApproveRebate(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canApproveRebate(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canViewReports(admin, "store-2"), true);
  assert.equal(PermissionPolicy.canViewReports(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canViewReports(worker, "store-1"), false);
});

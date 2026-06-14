import assert from "node:assert/strict";
import { test } from "node:test";
import { getActiveManagementMenuKey, getManagementMenuItems } from "./management-menu";

test("management menu maps manager role to full prototype sidebar", () => {
  const items = getManagementMenuItems({ position: "MANAGER", storeId: "store-1" });
  const labels = items.map((item) => item.label);
  const membersItem = items.find((item) => item.label === "人员管理");

  assert.equal(labels.includes("工作台"), true);
  assert.equal(labels.includes("客户管理"), true);
  assert.equal(labels.includes("销售订单"), true);
  assert.equal(labels.includes("施工管理"), true);
  assert.equal(labels.includes("库存管理"), true);
  assert.equal(labels.includes("质保管理"), true);
  assert.equal(labels.includes("售后管理"), true);
  assert.equal(labels.includes("财务管理"), true);
  assert.equal(labels.includes("数据报表"), true);
  assert.equal(membersItem?.href, "/members");
});

test("management menu scopes sales users to sales workflow", () => {
  const labels = getManagementMenuItems({ position: "SALES", storeId: "store-1" }).map((item) => item.label);

  assert.deepEqual(labels, ["工作台", "客户管理", "销售订单", "数据报表"]);
});

test("management menu exposes auditor review entry", () => {
  const items = getManagementMenuItems({ isAuditor: true });
  const labels = items.map((item) => item.label);
  const settingsItem = items.find((item) => item.label === "系统设置");

  assert.equal(labels.includes("门店审核"), true);
  assert.equal(labels.includes("系统设置"), true);
  assert.equal(labels.includes("个人中心"), false);
  assert.equal(settingsItem?.href, "/settings");
});

test("active management menu key follows route groups", () => {
  assert.equal(getActiveManagementMenuKey("/orders/create"), "orders");
  assert.equal(getActiveManagementMenuKey("/construction/capacities"), "capacity");
  assert.equal(getActiveManagementMenuKey("/construction/assignments"), "construction");
  assert.equal(getActiveManagementMenuKey("/inventory/purchase-orders/po-1"), "inventory");
  assert.equal(getActiveManagementMenuKey("/members"), "members");
  assert.equal(getActiveManagementMenuKey("/settings"), "settings");
  assert.equal(getActiveManagementMenuKey("/profile"), "profile");
});

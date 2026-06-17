import assert from "node:assert/strict";
import { test } from "node:test";
import { getActiveManagementMenuKey, getManagementMenuItems } from "./management-menu";

test("management menu maps manager role to full prototype sidebar", () => {
  const items = getManagementMenuItems({ position: "MANAGER", storeId: "store-1" });
  const labels = items.map((item) => item.label);
  const membersItem = items.find((item) => item.label === "人员管理");
  const productItem = items.find((item) => item.label === "产品管理");
  const inventoryItem = items.find((item) => item.label === "库存管理");
  const purchaseItem = items.find((item) => item.label === "采购管理");

  assert.equal(labels.includes("工作台"), true);
  assert.equal(labels.includes("客户管理"), true);
  assert.equal(labels.includes("销售订单"), true);
  assert.equal(labels.includes("产品管理"), true);
  assert.equal(productItem?.href, "/products");
  assert.deepEqual(labels.slice(0, 4), ["工作台", "客户管理", "销售订单", "产品管理"]);
  assert.equal(labels.includes("施工管理"), true);
  assert.equal(labels.includes("施工容量"), false);
  assert.equal(labels.includes("库存管理"), true);
  assert.equal(inventoryItem?.href, "/inventory");
  assert.equal(labels.includes("采购管理"), true);
  assert.equal(purchaseItem?.href, "/purchases");
  assert.equal(labels.includes("质保管理"), true);
  assert.equal(labels.includes("售后管理"), true);
  assert.equal(labels.includes("财务管理"), true);
  assert.equal(labels.includes("报表分析"), true);
  assert.equal(labels.includes("数据报表"), false);
  assert.equal(labels.includes("提成管理"), false);
  assert.equal(membersItem?.href, "/members");
  assert.deepEqual(
    labels,
    ["工作台", "客户管理", "销售订单", "产品管理", "施工管理", "库存管理", "采购管理", "质保管理", "售后管理", "人员管理", "财务管理", "报表分析", "发票管理", "返利管理", "系统设置"]
  );
});

test("management menu keeps customer service inventory and purchase read-only entries without product management", () => {
  const items = getManagementMenuItems({ position: "CUSTOMER_SERVICE" as never, storeId: "store-1" });
  const labels = items.map((item) => item.label);

  assert.equal(labels.includes("产品管理"), false);
  assert.equal(items.find((item) => item.label === "库存管理")?.href, "/inventory");
  assert.equal(items.find((item) => item.label === "采购管理")?.href, "/purchases");
});

test("management menu scopes sales users to sales workflow", () => {
  const labels = getManagementMenuItems({ position: "SALES", storeId: "store-1" }).map((item) => item.label);

  assert.deepEqual(labels, ["工作台", "客户管理", "销售订单", "报表分析"]);
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
  assert.equal(getActiveManagementMenuKey("/construction/capacities"), "construction");
  assert.equal(getActiveManagementMenuKey("/construction/assignments"), "construction");
  assert.equal(getActiveManagementMenuKey("/products"), "products");
  assert.equal(getActiveManagementMenuKey("/inventory/movements"), "inventory");
  assert.equal(getActiveManagementMenuKey("/purchases/orders/po-1"), "purchases");
  assert.equal(getActiveManagementMenuKey("/commissions"), "finance");
  assert.equal(getActiveManagementMenuKey("/commissions/settlements"), "finance");
  assert.equal(getActiveManagementMenuKey("/members"), "members");
  assert.equal(getActiveManagementMenuKey("/settings"), "settings");
  assert.equal(getActiveManagementMenuKey("/profile"), "profile");
});

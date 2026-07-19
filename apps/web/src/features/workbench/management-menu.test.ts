import assert from "node:assert/strict";
import { test } from "node:test";
import { getActiveManagementMenuKey, getManagementMenuItems } from "./management-menu";

test("management menu maps manager role to full prototype sidebar", () => {
  const items = getManagementMenuItems({ position: "MANAGER", storeId: "store-1" });
  const labels = items.map((item) => item.label);
  const membersItem = items.find((item) => item.label === "人员管理");
  const productItem = items.find((item) => item.label === "产品管理");
  const costSettlementItem = items.find((item) => item.label === "施工成本确认");
  const costStandardsItem = items.find((item) => item.label === "施工收费标准");
  const inventoryItem = items.find((item) => item.label === "库存管理");
  const purchaseItem = items.find((item) => item.label === "采购管理");

  assert.equal(labels.includes("工作台"), true);
  assert.equal(labels.includes("客户管理"), true);
  assert.equal(labels.includes("销售订单"), true);
  assert.equal(labels.includes("产品管理"), true);
  assert.equal(productItem?.href, "/products");
  assert.deepEqual(labels.slice(0, 7), ["工作台", "客户管理", "销售订单", "建议价设置", "施工收费标准", "报价审批", "产品管理"]);
  assert.equal(labels.includes("施工管理"), true);
  assert.equal(costStandardsItem?.href, "/orders/pricing/construction-costs");
  assert.equal(costSettlementItem?.href, "/construction/cost-settlements");
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
    ["工作台", "客户管理", "销售订单", "建议价设置", "施工收费标准", "报价审批", "产品管理", "施工管理", "施工成本确认", "库存管理", "采购管理", "质保管理", "售后管理", "人员管理", "费用申请", "财务管理", "报表分析", "发票管理", "返利管理", "系统设置"]
  );
});

test("management menu keeps customer service inventory and purchase read-only entries without product management", () => {
  const items = getManagementMenuItems({ position: "CUSTOMER_SERVICE" as never, storeId: "store-1" });
  const labels = items.map((item) => item.label);

  assert.equal(labels.includes("产品管理"), false);
  assert.equal(items.find((item) => item.label === "库存管理")?.href, "/inventory");
  assert.equal(items.find((item) => item.label === "采购管理")?.href, "/purchases");
  assert.equal(labels.includes("施工收费标准"), false);
});

test("management menu scopes sales users to sales workflow", () => {
  const labels = getManagementMenuItems({ position: "SALES", storeId: "store-1" }).map((item) => item.label);

  assert.deepEqual(labels, ["工作台", "客户管理", "销售订单", "报价审批", "费用申请", "报表分析"]);
});

test("management menu routes finance to role cost, product material cost and purchase review", () => {
  const items = getManagementMenuItems({ position: "FINANCE", storeId: "store-1" });
  assert.equal(items.find((item) => item.label === "岗位成本标准")?.href, "/orders/pricing/construction-costs/rates");
  assert.equal(items.find((item) => item.label === "产品管理")?.href, "/products");
  assert.equal(items.find((item) => item.label === "采购管理")?.href, "/purchases");
  assert.equal(items.find((item) => item.label === "施工成本结算")?.href, "/construction/cost-settlements");
  assert.equal(items.some((item) => item.label === "施工收费标准"), false);
});

test("management menu exposes desktop worker self-service entries for construction staff", () => {
  const items = getManagementMenuItems({ position: "CONSTRUCTION", storeId: "store-1" });
  const labels = items.map((item) => item.label);

  assert.deepEqual(labels, ["工作台", "我的施工任务", "我的排班", "请假申请", "施工物料", "施工档案", "售后任务", "费用申请"]);
  assert.equal(items.find((item) => item.label === "我的施工任务")?.href, "/construction/tasks");
  assert.equal(items.find((item) => item.label === "我的排班")?.href, "/construction/schedules");
  assert.equal(items.find((item) => item.label === "请假申请")?.href, "/construction/leaves");
  assert.equal(items.find((item) => item.label === "施工物料")?.href, "/construction/materials");
  assert.equal(items.find((item) => item.label === "施工档案")?.href, "/construction/profile");
  assert.equal(items.find((item) => item.label === "售后任务")?.href, "/after-sales/tasks");
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
  assert.equal(getActiveManagementMenuKey("/orders/pricing"), "pricing");
  assert.equal(getActiveManagementMenuKey("/orders/pricing/construction-costs/standards"), "construction-charge-standards");
  assert.equal(getActiveManagementMenuKey("/orders/pricing/construction-costs/rates"), "construction-role-costs");
  assert.equal(getActiveManagementMenuKey("/orders/quotes"), "sales-quotes");
  assert.equal(getActiveManagementMenuKey("/construction/tasks"), "construction-tasks");
  assert.equal(getActiveManagementMenuKey("/construction/schedules"), "construction-schedules");
  assert.equal(getActiveManagementMenuKey("/construction/leaves"), "construction-leaves");
  assert.equal(getActiveManagementMenuKey("/construction/materials"), "construction-materials");
  assert.equal(getActiveManagementMenuKey("/construction/profile"), "construction-profile");
  assert.equal(getActiveManagementMenuKey("/after-sales/tasks"), "after-sales-tasks");
  assert.equal(getActiveManagementMenuKey("/construction/capacities"), "construction");
  assert.equal(getActiveManagementMenuKey("/construction/assignments"), "construction");
  assert.equal(getActiveManagementMenuKey("/products"), "products");
  assert.equal(getActiveManagementMenuKey("/inventory/movements"), "inventory");
  assert.equal(getActiveManagementMenuKey("/purchases/orders/po-1"), "purchases");
  assert.equal(getActiveManagementMenuKey("/commissions"), "finance");
  assert.equal(getActiveManagementMenuKey("/finance/expenses"), "finance-expenses");
  assert.equal(getActiveManagementMenuKey("/commissions/settlements"), "finance");
  assert.equal(getActiveManagementMenuKey("/members"), "members");
  assert.equal(getActiveManagementMenuKey("/settings"), "settings");
  assert.equal(getActiveManagementMenuKey("/profile"), "profile");
});

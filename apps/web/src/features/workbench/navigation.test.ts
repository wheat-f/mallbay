import test from "node:test";
import assert from "node:assert/strict";
import { getStoreWorkbenchHref, getWorkbenchSections } from "./navigation";

test("getStoreWorkbenchHref builds a store workbench route", () => {
  assert.equal(getStoreWorkbenchHref("store-1"), "/workbench/store-1");
});

test("sales workbench exposes customer and order actions", () => {
  const sections = getWorkbenchSections("SALES", "store-1");
  const labels = sections.flatMap((section) => section.items.map((item) => item.label));
  const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));

  assert.deepEqual(labels, ["新建订单", "订单管理", "客户管理", "我的业绩"]);
  assert.equal(hrefs.includes("/orders/create"), true);
  assert.equal(hrefs.includes("/orders"), true);
  assert.equal(hrefs.includes("/customers"), true);
  assert.equal(hrefs.includes("/reports"), true);
});

test("manager workbench exposes full store operations", () => {
  const labels = getWorkbenchSections("MANAGER", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.equal(labels.includes("新建订单"), true);
  assert.equal(labels.includes("产品管理"), true);
  assert.equal(labels.includes("施工派单"), true);
  assert.equal(labels.includes("库存采购"), true);
  assert.equal(labels.includes("财务管理"), true);
  assert.equal(labels.includes("经营报表"), true);
});

test("construction roles only expose assigned task workflow", () => {
  const labels = getWorkbenchSections("CONSTRUCTION", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["我的施工任务"]);
});

test("apprentice workbench uses the same task workflow as construction workers", () => {
  const labels = getWorkbenchSections("APPRENTICE", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["我的施工任务"]);
});

test("scheduler workbench exposes construction management actions", () => {
  const labels = getWorkbenchSections("SCHEDULER", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["施工容量", "施工派单", "售后管理", "质保管理"]);
});

test("purchasing workbench exposes inventory product and expense actions", () => {
  const labels = getWorkbenchSections("PURCHASING", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["库存采购", "产品管理", "财务管理"]);
});

test("finance workbench exposes order finance invoice rebate and report actions", () => {
  const labels = getWorkbenchSections("FINANCE", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["订单管理", "财务管理", "发票管理", "返利管理", "经营报表"]);
});

test("customer service workbench exposes customer order inventory warranty after-sales and rebate actions", () => {
  const labels = getWorkbenchSections("CUSTOMER_SERVICE" as never, "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["客户管理", "订单管理", "新建订单", "库存采购", "质保管理", "售后管理", "返利管理"]);
});

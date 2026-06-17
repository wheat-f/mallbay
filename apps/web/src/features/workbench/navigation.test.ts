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
  const sections = getWorkbenchSections("MANAGER", "store-1");
  const labels = sections
    .flatMap((section) => section.items.map((item) => item.label));
  const items = sections.flatMap((section) => section.items);
  const fulfillment = sections.find((section) => section.title === "门店履约");
  const operating = sections.find((section) => section.title === "经营管理");

  assert.equal(labels.includes("新建订单"), true);
  assert.equal(labels.includes("产品管理"), true);
  assert.equal(items.find((item) => item.label === "产品管理")?.href, "/products");
  assert.equal(labels.includes("施工派单"), true);
  assert.equal(labels.includes("库存管理"), true);
  assert.equal(items.find((item) => item.label === "库存管理")?.href, "/inventory");
  assert.equal(labels.includes("采购管理"), true);
  assert.equal(items.find((item) => item.label === "采购管理")?.href, "/purchases");
  assert.equal(fulfillment?.items.some((item) => item.label === "提成管理"), false);
  assert.equal(operating?.items.some((item) => item.label === "提成管理"), true);
  assert.equal(labels.includes("财务管理"), true);
  assert.equal(labels.includes("报表分析"), true);
  assert.equal(labels.includes("经营报表"), false);
});

test("construction roles only expose assigned task workflow", () => {
  const items = getWorkbenchSections("CONSTRUCTION", "store-1")
    .flatMap((section) => section.items);
  const labels = items.map((item) => item.label);

  assert.deepEqual(labels, ["我的施工任务"]);
  assert.deepEqual(items.map((item) => item.href), ["/construction/assignments"]);
});

test("apprentice workbench uses the same task workflow as construction workers", () => {
  const items = getWorkbenchSections("APPRENTICE", "store-1")
    .flatMap((section) => section.items);
  const labels = items.map((item) => item.label);

  assert.deepEqual(labels, ["我的施工任务"]);
  assert.deepEqual(items.map((item) => item.href), ["/construction/assignments"]);
});

test("scheduler workbench exposes construction management actions", () => {
  const labels = getWorkbenchSections("SCHEDULER", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["施工容量", "施工派单", "售后管理", "质保管理"]);
});

test("purchasing workbench exposes separate product inventory purchase and expense actions", () => {
  const items = getWorkbenchSections("PURCHASING", "store-1")
    .flatMap((section) => section.items);
  const labels = items.map((item) => item.label);

  assert.deepEqual(labels, ["产品管理", "库存管理", "采购管理", "财务管理"]);
  assert.deepEqual(items.map((item) => item.href), ["/products", "/inventory", "/purchases", "/finance"]);
});

test("finance workbench exposes order finance invoice rebate and report actions", () => {
  const labels = getWorkbenchSections("FINANCE", "store-1")
    .flatMap((section) => section.items.map((item) => item.label));

  assert.deepEqual(labels, ["订单管理", "财务管理", "提成管理", "发票管理", "返利管理", "报表分析"]);
});

test("customer service workbench exposes read-only inventory and purchase entries without product management", () => {
  const items = getWorkbenchSections("CUSTOMER_SERVICE" as never, "store-1")
    .flatMap((section) => section.items);
  const labels = items.map((item) => item.label);

  assert.deepEqual(labels, ["客户管理", "订单管理", "新建订单", "库存管理", "采购管理", "质保管理", "售后管理", "返利管理"]);
  assert.equal(items.find((item) => item.label === "库存管理")?.description.includes("只读"), true);
  assert.equal(items.find((item) => item.label === "采购管理")?.description.includes("只读"), true);
  assert.equal(labels.includes("产品管理"), false);
});

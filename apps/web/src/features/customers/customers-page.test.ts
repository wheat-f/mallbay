import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/customers/page.tsx", "utf8");

test("customers page follows the prototype customer operations layout", () => {
  assert.match(pageSource, /StorePageHeader title="客户管理"/);
  assert.match(pageSource, /新建客户/);
  assert.match(pageSource, /customers-filter-card/);
  assert.match(pageSource, /customers-search-chips/);
  assert.match(pageSource, /快速搜索/);
  assert.match(pageSource, /客户标签/);
  assert.match(pageSource, /消费价值/);
  assert.match(pageSource, /质保状态/);
  assert.match(pageSource, /最近消费时间/);
  assert.match(pageSource, /客户姓名\/企业名称/);
  assert.match(pageSource, /消费总额/);
  assert.match(pageSource, /最近消费/);
  assert.match(pageSource, /有效质保/);
});

test("customers page keeps order creation as a row action instead of the primary page action", () => {
  assert.match(pageSource, /新建订单/);
  assert.doesNotMatch(pageSource, /StorePageHeader[\s\S]*新建订单[\s\S]*<\/StorePageHeader>/);
});

test("customers page uses mobile archive cards instead of squeezing the desktop table", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /customers-mobile-cards/);
  assert.match(pageSource, /customers-mobile-card/);
  assert.match(pageSource, /customers-desktop-table/);
  assert.match(cssSource, /\.customers-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.customers-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.customers-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("customers page opens a prototype right-side customer detail drawer from table rows", () => {
  assert.match(pageSource, /Drawer/);
  assert.match(pageSource, /selectedCustomer/);
  assert.match(pageSource, /setSelectedCustomer\(row\)/);
  assert.match(pageSource, /onRow=\{\(row\) =>/);
  assert.match(pageSource, /customers-detail-drawer/);
  assert.match(pageSource, /客户详情/);
  assert.match(pageSource, /名下车辆/);
  assert.match(pageSource, /消费概览/);
  assert.match(pageSource, /查看完整历史/);
  assert.match(pageSource, /orders\/create\?customerId=/);
  assert.doesNotMatch(pageSource, /onClick=\{\(\) => router\.push\(`\/customers\/\$\{row\.id\}`\)\}/);
});

test("customers detail drawer avoids deprecated Ant Design width prop", () => {
  assert.doesNotMatch(pageSource, /width=\{480\}/);
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /customers-detail-drawer[\s\S]*ant-drawer-content-wrapper/);
});

test("customers page creates customer records in a prototype right-side drawer", () => {
  assert.match(pageSource, /customers-create-drawer/);
  assert.match(pageSource, /open=\{createOpen\}/);
  assert.match(pageSource, /创建客户/);
  assert.match(pageSource, /客户类型/);
  assert.match(pageSource, /介绍人/);
  assert.doesNotMatch(pageSource, /<Modal/);
  assert.doesNotMatch(pageSource, /width=\{/);
  assert.doesNotMatch(pageSource, /forceRender/);

  const cssSource = readFileSync("app/globals.css", "utf8");
  assert.match(cssSource, /customers-create-drawer[\s\S]*ant-drawer-content-wrapper/);
});

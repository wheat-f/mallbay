import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/customers/page.tsx", "utf8");
const apiSource = readFileSync("src/features/customers/api.ts", "utf8");

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
  assert.match(pageSource, /待质保录入/);
  assert.doesNotMatch(pageSource, /<Tag>待生成<\/Tag>/);
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
  assert.match(cssSource, /@media \(max-width: 900px\) \{\r?\n\s{2}\.customers-desktop-table \{\r?\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.customers-mobile-cards \{\r?\n\s{4}display: grid;/);
});

test("customers page opens a prototype right-side customer detail drawer from table rows", () => {
  assert.match(pageSource, /Drawer/);
  assert.match(pageSource, /selectedCustomer/);
  assert.match(pageSource, /setSelectedCustomer\(row\)/);
  assert.match(pageSource, /onRow=\{\(row\) =>/);
  assert.match(pageSource, /customers-detail-drawer/);
  assert.match(pageSource, /客户详情/);
  assert.match(pageSource, /名下车辆/);
  assert.match(pageSource, /企业用户/);
  assert.match(pageSource, /消费概览/);
  assert.match(pageSource, /查看完整历史/);
  assert.match(pageSource, /维护人工标签/);
  assert.match(pageSource, /customer-detail-drawer/);
  assert.match(pageSource, /customerApi\.detail\(selectedCustomer!\.id\)/);
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
  assert.match(pageSource, /车辆档案/);
  assert.match(pageSource, /Form\.List name="companyUsers"/);
  assert.match(pageSource, /企业客户下可维护多个用户，暂不区分角色/);
  assert.doesNotMatch(pageSource, /用户角色/);
  assert.match(pageSource, /Form\.List name="vehicles"/);
  assert.match(pageSource, /customerApi\.createVehicle/);
  assert.match(pageSource, /toCreateVehiclePayloads/);
  assert.match(pageSource, /介绍人/);
  assert.doesNotMatch(pageSource, /customer\.companyName \?\? customer\.name \?\? customer\.contactPerson \?\? customer\.id/);
  assert.match(pageSource, /customer\.companyName \?\? customer\.name \?\? customer\.contactPerson \?\? "未命名客户"/);
  assert.doesNotMatch(pageSource, /<Modal/);
  assert.doesNotMatch(pageSource, /width=\{/);
  assert.doesNotMatch(pageSource, /forceRender/);

  const cssSource = readFileSync("app/globals.css", "utf8");
  assert.match(cssSource, /customers-create-drawer[\s\S]*ant-drawer-content-wrapper/);
});

test("customers page exposes customer editing from the list and detail drawer", () => {
  assert.match(pageSource, /EditOutlined/);
  assert.match(pageSource, /editCustomer/);
  assert.match(pageSource, /customers-edit-drawer/);
  assert.match(pageSource, /title="编辑客户"/);
  assert.match(pageSource, /aria-label="编辑客户"/);
  assert.match(pageSource, /customerApi\.update\(editCustomer\.id/);
  assert.match(pageSource, /编辑客户/);
  assert.match(pageSource, /保存修改/);
});

test("customers page separates vehicle editing from customer editing", () => {
  assert.match(apiSource, /updateVehicle: \(id: string, payload: UpdateVehiclePayload\)/);
  assert.match(apiSource, /`\/customers\/vehicles\/\$\{id\}`/);
  assert.match(pageSource, /CarOutlined/);
  assert.match(pageSource, /openVehicleDrawer\(row\)/);
  assert.match(pageSource, /aria-label=\{getVehicleActionLabel\(row\)\}/);
  assert.match(pageSource, /customers-vehicle-drawer/);
  assert.match(pageSource, /title="车辆管理"/);
  assert.match(pageSource, /customerApi\.updateVehicle\(editingVehicle\.id/);
  assert.match(pageSource, /customerApi\.createVehicle/);
  assert.match(pageSource, /保存车辆/);
});

test("customers vehicle drawer can add vehicles and edit any existing vehicle", () => {
  assert.match(pageSource, /openVehicleDrawer = \(customer: CustomerRow, vehicle\?: CustomerVehicle\)/);
  assert.match(pageSource, /setEditingVehicle\(vehicle \?\? null\)/);
  assert.doesNotMatch(pageSource, /const vehicle = customer\.vehicles\?\.\[0\] \?\? null/);
  assert.match(pageSource, /customers-vehicle-list/);
  assert.match(pageSource, /已有车辆/);
  assert.match(pageSource, /新增车辆/);
  assert.match(pageSource, /vehicleCustomer\.vehicles\?\.map/);
  assert.match(pageSource, /openVehicleDrawer\(vehicleCustomer, vehicle\)/);
  assert.match(pageSource, /editingVehicle \? "编辑车辆" : "新增车辆"/);
});

test("customers vehicle drawer uploads vehicle photos directly", () => {
  assert.match(apiSource, /requestMultipart/);
  assert.match(apiSource, /uploadVehiclePhoto: \(file: File\)/);
  assert.match(apiSource, /\/customers\/vehicles\/photos\/upload/);
  assert.match(pageSource, /Upload/);
  assert.match(pageSource, /UploadOutlined/);
  assert.match(pageSource, /uploadVehiclePhoto/);
  assert.match(pageSource, /customRequest=\{handleVehiclePhotoUpload\}/);
  assert.match(pageSource, /直接上传车辆照片/);
  assert.doesNotMatch(pageSource, /label="车辆照片链接"/);
});

test("customers create drawer supports creating multiple vehicles with a new customer", () => {
  assert.match(pageSource, /toCreateVehiclePayloads/);
  assert.match(pageSource, /Promise\.all\(vehiclePayloads\.map/);
  assert.match(pageSource, /Form\.List name="vehicles"/);
  assert.match(pageSource, /增加车辆/);
  assert.match(pageSource, /删除车辆/);
  assert.match(pageSource, /name=\{\[field\.name, "carModel"\]\}/);
});

test("customers birthday year dropdown has enough width in the create drawer", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /classNames=\{\{ popup: \{ root: "customers-birthday-year-popup" \} \}\}/);
  assert.match(pageSource, /popupMatchSelectWidth=\{false\}/);
  assert.doesNotMatch(pageSource, /popupClassName=/);
  assert.match(cssSource, /\.customers-birthday-year-popup\s*\{[\s\S]*min-width: 118px !important;/);
  assert.match(cssSource, /\.customers-birthday-year-popup \.ant-select-item-option-content\s*\{[\s\S]*text-overflow: clip;/);
});

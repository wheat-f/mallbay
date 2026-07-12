import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("customer detail page follows the prototype customer profile workspace", () => {
  const pageSource = readFileSync("app/customers/[id]/page.tsx", "utf8");

  assert.match(pageSource, /customer-detail-hero/);
  assert.match(pageSource, /customer-detail-hero-summary/);
  assert.match(pageSource, /customer-detail-workspace/);
  assert.match(pageSource, /customer-profile-card/);
  assert.match(pageSource, /customer-vehicle-grid/);
  assert.match(pageSource, /customer-history-card/);
  assert.match(pageSource, /customer-timeline-card/);
  assert.match(pageSource, /customer-warranty-card/);
  assert.match(pageSource, /customer-notes-card/);
  assert.match(pageSource, /编辑资料/);
  assert.match(pageSource, /新建订单/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.doesNotMatch(pageSource, /customer-detail-metrics/);
  assert.doesNotMatch(pageSource, /detail-layout/);
});

test("customer detail returns to the customer list instead of the workbench", () => {
  const pageSource = readFileSync("app/customers/[id]/page.tsx", "utf8");

  assert.match(pageSource, /返回客户列表/);
  assert.match(pageSource, /router\.push\("\/customers"\)/);
  assert.doesNotMatch(pageSource, /返回工作台/);
});

test("customer detail warranty records do not expose technical ids", () => {
  const pageSource = readFileSync("app/customers/[id]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /warranty\.warrantyNo \?\? warranty\.id/);
  assert.match(pageSource, /warranty\.warrantyNo \?\? "未生成质保编号"/);
});

test("customer detail edit actions use prototype right-side drawers", () => {
  const pageSource = readFileSync("app/customers/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /import \{[^}]*Drawer[^}]*\} from "antd"/s);
  assert.match(pageSource, /customer-detail-edit-drawer/);
  assert.match(pageSource, /customer-detail-vehicle-drawer/);
  assert.match(pageSource, /customer-detail-drawer-footer/);
  assert.doesNotMatch(pageSource, /Modal\.confirm/);
  assert.doesNotMatch(pageSource, /openEditModal/);
  assert.doesNotMatch(pageSource, /openVehicleModal/);
  assert.match(cssSource, /\.customer-detail-edit-drawer \.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.customer-detail-vehicle-drawer \.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.customer-detail-drawer-footer/);
});

test("customer detail vehicle drawer uploads vehicle photos directly", () => {
  const pageSource = readFileSync("app/customers/[id]/page.tsx", "utf8");

  assert.match(pageSource, /Upload/);
  assert.match(pageSource, /UploadOutlined/);
  assert.match(pageSource, /uploadVehiclePhoto/);
  assert.match(pageSource, /customRequest=\{handleVehiclePhotoUpload\}/);
  assert.match(pageSource, /直接上传车辆照片/);
  assert.doesNotMatch(pageSource, /车辆照片链接/);
  assert.doesNotMatch(pageSource, /粘贴已上传的车辆照片链接/);
  assert.doesNotMatch(pageSource, /车辆照片 URL/);
});

test("customer detail page replaces nested tables with mobile record cards", () => {
  const pageSource = readFileSync("app/customers/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const normalizedCssSource = cssSource.replace(/\r\n/g, "\n");
  const baseHiddenIndex = normalizedCssSource.indexOf(".customer-record-mobile-cards {\n  display: none");
  const desktopTableIndex = normalizedCssSource.indexOf(".customer-record-desktop-table");
  const mobileDisplayIndex = normalizedCssSource.indexOf(".customer-record-mobile-cards", desktopTableIndex);
  const customerRecordBreakpoint = normalizedCssSource.match(
    /@media \(max-width: (\d+)px\) \{\s*\.customer-record-desktop-table\s*\{\s*display: none;\s*\}\s*\.customer-record-mobile-cards\s*\{\s*display: grid;/
  );

  assert.match(pageSource, /customer-record-mobile-cards/);
  assert.match(pageSource, /customer-record-mobile-card/);
  assert.match(pageSource, /customer-record-desktop-table/);
  assert.match(pageSource, /customer-order-mobile-card/);
  assert.match(pageSource, /customer-warranty-mobile-card/);
  assert.match(pageSource, /customer-after-sale-mobile-card/);
  assert.match(normalizedCssSource, /\.customer-record-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.equal(customerRecordBreakpoint?.[1], "900");
  assert.ok(baseHiddenIndex >= 0, "base hidden rule must exist");
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});

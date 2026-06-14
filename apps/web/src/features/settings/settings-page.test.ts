import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pagePath = "app/settings/page.tsx";

test("system settings page exists as a dedicated management workspace", () => {
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /StorePageHeader/);
  assert.match(source, /系统设置/);
  assert.match(source, /settings-workspace/);
  assert.match(source, /management-kpi-grid/);
  assert.match(source, /management-filter-card/);
  assert.match(source, /settings-permission-matrix/);
  assert.match(source, /岗位权限/);
  assert.match(source, /权限矩阵/);
  assert.match(source, /门店策略/);
});

test("system settings page exposes the prototype role permission matrix", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /rolePermissionMatrixRows/);
  assert.match(source, /rolePermissionModules/);
  assert.match(source, /管理员/);
  assert.match(source, /店长/);
  assert.match(source, /销售/);
  assert.match(source, /客服/);
  assert.match(source, /施工主管/);
  assert.match(source, /师傅/);
  assert.match(source, /采购\/库存/);
  assert.match(source, /财务/);
  assert.match(source, /客户/);
  assert.match(source, /销售单/);
  assert.match(source, /施工/);
  assert.match(source, /库存/);
  assert.match(source, /质保/);
  assert.match(source, /售后/);
  assert.match(source, /人员/);
  assert.match(source, /报表分析/);
  assert.match(source, /发票/);
  assert.match(source, /返利/);
  assert.match(source, /完全控制/);
  assert.match(source, /部分权限/);
  assert.match(source, /仅查看/);
  assert.match(source, /无权限/);
  assert.match(source, /settings-matrix-legend/);
  assert.match(source, /settings-role-permission-table/);
  assert.match(source, /settings-permission-mobile-cards/);
  assert.match(source, /settings-permission-mobile-card/);
  assert.match(source, /settings-permission-mobile-grid/);
  assert.match(source, /settings-matrix-cell/);
  assert.match(cssSource, /\.settings-matrix-legend/);
  assert.match(cssSource, /\.settings-role-permission-table/);
  assert.match(cssSource, /\.settings-permission-mobile-cards/);
  assert.match(cssSource, /\.settings-permission-mobile-card/);
  assert.match(cssSource, /\.settings-permission-mobile-grid/);
  assert.match(cssSource, /\.settings-matrix-cell/);
  assert.match(cssSource, /grid-template-columns:\s*repeat\(auto-fit, minmax\(260px, 1fr\)\)/);
  assert.match(cssSource, /\.settings-permission-card\.ant-card\s+\.ant-card-body[\s\S]*min-width:\s*0/);
  assert.match(cssSource, /\.settings-permission-matrix[\s\S]*max-width:\s*100%/);
  assert.match(cssSource, /\.settings-role-permission-table table[\s\S]*width:\s*max-content/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.settings-role-permission-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.settings-permission-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("system settings page stays separate from profile account security", () => {
  const settingsSource = readFileSync(pagePath, "utf8");
  const profileSource = readFileSync("app/profile/page.tsx", "utf8");

  assert.match(profileSource, /账号安全/);
  assert.match(profileSource, /profile-security-workspace/);
  assert.doesNotMatch(settingsSource, /修改密码/);
  assert.doesNotMatch(settingsSource, /profile-security-workspace/);
  assert.doesNotMatch(settingsSource, /返回工作台/);
});

test("system settings custom role action opens a prototype policy drawer", () => {
  const settingsSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(settingsSource, /\bDrawer\b/);
  assert.match(settingsSource, /const \[rolePolicyOpen, setRolePolicyOpen\]/);
  assert.match(settingsSource, /onClick=\{\(\) => setRolePolicyOpen\(true\)\}/);
  assert.match(settingsSource, /rootClassName="settings-policy-drawer"/);
  assert.match(settingsSource, /settings-policy-drawer-footer/);
  assert.match(settingsSource, /岗位策略草案/);
  assert.match(cssSource, /\.settings-policy-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.settings-policy-drawer-footer/);
});

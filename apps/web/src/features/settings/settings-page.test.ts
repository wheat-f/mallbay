import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pagePath = "app/settings/page.tsx";

test("system settings page exists as a dedicated management workspace", () => {
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /canAccessSystemSettings/);
  assert.match(source, /useAuthStore/);
  assert.match(source, /hasHydrated/);
  assert.match(source, /router\.replace\("\/dashboard"\)/);
  assert.match(source, /StorePageHeader/);
  assert.match(source, /系统设置/);
  assert.match(source, /settings-workspace/);
  assert.match(source, /management-kpi-grid/);
  assert.match(source, /management-filter-card/);
  assert.match(source, /settings-permission-matrix/);
  assert.match(source, /岗位权限/);
  assert.match(source, /权限矩阵/);
  assert.match(source, /label: "门店配置"/);
  assert.match(source, /label: "账号设置"/);
  assert.match(source, /label: "通知\/OSS设置"/);
  assert.doesNotMatch(source, /门店策略/);
});

test("system settings page exposes the prototype role permission matrix", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const matrixIndex = source.indexOf('className="settings-permission-card"');
  const rolePanelIndex = source.indexOf('className="management-filter-card settings-role-panel"');

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
  assert.doesNotMatch(source, /经营报表/);
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
  assert.match(cssSource, /@media \(max-width: 900px\) \{\r?\n\s{2}\.settings-role-permission-table \{\r?\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.settings-permission-mobile-cards \{\r?\n\s{4}display: grid;/);
  assert.ok(matrixIndex > -1, "permission matrix card should exist");
  assert.ok(rolePanelIndex > -1, "role explanation panel should exist");
  assert.ok(matrixIndex < rolePanelIndex, "permission matrix should appear before role cards like the prototype");
});

test("system settings role cards use prototype business role titles", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /name: "销售顾问"/);
  assert.doesNotMatch(source, /name: "销售",/);
  assert.match(source, /客户档案、订单创建、收款跟进和个人业绩查看。/);
});

test("system settings page exposes prototype dictionary switches and OSS configuration", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /settings-configuration-board/);
  assert.match(source, /settings-dictionary-card/);
  assert.match(source, /settings-quick-switch-card/);
  assert.match(source, /settings-service-card/);
  assert.match(source, /基础字典配置/);
  assert.match(source, /分类名称/);
  assert.match(source, /字典代码/);
  assert.match(source, /质保周期/);
  assert.match(source, /WARRANTY_PERIOD/);
  assert.match(source, /快速开关/);
  assert.match(source, /施工全过程拍照/);
  assert.match(source, /开启后质保申请必传照片/);
  assert.match(source, /短信自动提醒客户/);
  assert.match(source, /物料库存预警/);
  assert.match(source, /存储与通知服务 \(OSS\/SMTP\)/);
  assert.match(source, /阿里云 OSS \(推荐\)/);
  assert.match(source, /oss-cn-shanghai\.aliyuncs\.com/);
  assert.match(source, /mallbay-pro-assets/);
  assert.match(source, /测试连接/);
  assert.match(source, /访问密钥标识/);
  assert.match(source, /访问密钥密文/);
  assert.doesNotMatch(source, /Access Key ID/);
  assert.doesNotMatch(source, /Access Key Secret/);
  assert.match(cssSource, /\.settings-configuration-board/);
  assert.match(cssSource, /\.settings-dictionary-card/);
  assert.match(cssSource, /\.settings-quick-switch-card/);
  assert.match(cssSource, /\.settings-service-card/);
}
);

test("system settings section navigation jumps to the matching panels", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /SETTINGS_SECTION_NAV_ITEMS/);
  assert.match(source, /settingsSectionRefs/);
  assert.match(source, /scrollSettingsSectionIntoView/);
  assert.match(source, /activeSettingsSection/);
  assert.match(source, /ref=\{roleSettingsSectionRef\}/);
  assert.match(source, /ref=\{dictionarySettingsSectionRef\}/);
  assert.match(source, /ref=\{storeSettingsSectionRef\}/);
  assert.match(source, /ref=\{accountSettingsSectionRef\}/);
  assert.match(source, /ref=\{serviceSettingsSectionRef\}/);
  assert.match(source, /aria-pressed=\{activeSettingsSection === item\.key\}/);
  assert.match(source, /onClick=\{\(\) => scrollSettingsSectionIntoView\(item\.key\)\}/);
  assert.doesNotMatch(source, /\]\.map\(\(\[label, icon\], index\) =>/);
  assert.doesNotMatch(source, /settings-section-button-active\$\{index === 0/);
});

test("system settings page avoids implementation-phase setup copy", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /配置待确认/);
  assert.match(source, /配置确认中/);
  assert.match(source, /策略确认中/);
  assert.match(source, /确认权限边界后再开放策略调整与审计记录。/);
  assert.match(source, /权限边界按阶段确认/);
  assert.match(source, /先确认权限策略，再开放岗位创建/);
  assert.doesNotMatch(source, /\["配置状态", "分阶段"/);
  assert.doesNotMatch(source, /当前阶段/);
  assert.doesNotMatch(source, /待接入接口/);
  assert.doesNotMatch(source, /分阶段接入/);
  assert.doesNotMatch(source, /后续再接入/);
  assert.doesNotMatch(source, /先固化结构再接接口/);
  assert.doesNotMatch(source, /接岗位创建接口/);
});

test("system settings account action jumps to profile account security", () => {
  const settingsSource = readFileSync(pagePath, "utf8");
  const profileSource = readFileSync("app/profile/page.tsx", "utf8");

  assert.match(profileSource, /账号安全/);
  assert.match(profileSource, /profile-security-workspace/);
  assert.match(settingsSource, /router\.push\("\/profile"\)/);
  assert.doesNotMatch(settingsSource, /修改密码/);
  assert.doesNotMatch(settingsSource, /profile-security-workspace/);
  assert.doesNotMatch(settingsSource, /返回工作台/);
  assert.doesNotMatch(settingsSource, />\s*账号安全\s*</);
});

test("system settings visible action chips and buttons have concrete handlers", () => {
  const settingsSource = readFileSync(pagePath, "utf8");

  assert.match(settingsSource, /handleRoleScopeAction/);
  assert.match(settingsSource, /handlePolicyCardAction/);
  assert.match(settingsSource, /handleDictionaryAction/);
  assert.match(settingsSource, /handleServiceTest/);
  assert.match(settingsSource, /onClick=\{\(\) => handleRoleScopeAction\(scope\)\}/);
  assert.match(settingsSource, /onClick=\{\(\) => handlePolicyCardAction\(card\.title\)\}/);
  assert.match(settingsSource, /onDictionaryAction=\{handleDictionaryAction\}/);
  assert.match(settingsSource, /onServiceTest=\{handleServiceTest\}/);
  assert.match(settingsSource, /onClick=\{\(\) => onDictionaryAction\("export"\)\}/);
  assert.match(settingsSource, /onClick=\{\(\) => onDictionaryAction\("create"\)\}/);
  assert.match(settingsSource, /onClick=\{\(\) => onDictionaryAction\("edit", row\.name\)\}/);
  assert.match(settingsSource, /onClick=\{onServiceTest\}/);
  assert.match(settingsSource, /router\.push\(getSettingsScopeHref\(scope\)\)/);
  assert.doesNotMatch(settingsSource, /<Button>导出<\/Button>/);
  assert.doesNotMatch(settingsSource, /<Button type="primary">新增项<\/Button>/);
  assert.doesNotMatch(settingsSource, /<Button type="link">编辑<\/Button>/);
  assert.doesNotMatch(settingsSource, /<Button className="settings-service-test-button">测试连接<\/Button>/);
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

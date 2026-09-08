import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("app providers use prototype color tokens for Ant Design", () => {
  const source = readFileSync("src/providers/app-providers.tsx", "utf8");

  assert.match(source, /colorPrimary: "#0F3A5F"/);
  assert.match(source, /colorError: "#D71920"/);
  assert.match(source, /colorBgLayout: "#F6F8FB"/);
  assert.match(source, /borderRadius: 10/);
  assert.doesNotMatch(source, /colorPrimary: "#1677ff"/);
});

test("global css exposes MallBay prototype design tokens", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /--mb-primary: #0f3a5f/);
  assert.match(source, /--mb-surface-alt: #eef3f8/);
  assert.match(source, /--mb-radius-lg: 16px/);
  assert.match(source, /management-sidebar/);
  assert.match(source, /management-topbar/);
});

test("management shell wraps business routes and excludes public and mobile routes", () => {
  const source = readFileSync("src/features/workbench/management-shell.tsx", "utf8");
  const roleMenuStart = source.indexOf("const roleMenuItems = [");
  const accountMenuStart = source.indexOf("const accountMenuItems = [");
  const mobilePrefixesStart = source.indexOf("const mobilePrefixes = [");
  const shouldUseShellStart = source.indexOf("export function shouldUseManagementShell");
  const mobilePrefixesSource = source.slice(mobilePrefixesStart, shouldUseShellStart);
  const roleMenuSource = source.slice(roleMenuStart, accountMenuStart);
  const accountMenuSource = source.slice(accountMenuStart);

  assert.match(source, /shouldUseManagementShell/);
  assert.match(source, /management-brand-title">mallbay</);
  assert.match(source, /isHeadquartersAdmin \? "运营管理" : "mallbay"/);
  assert.doesNotMatch(source, />MallBay</);
  assert.doesNotMatch(source, /: "MallBay"/);
  assert.match(source, /门店运营系统/);
  assert.doesNotMatch(source, /Automotive SaaS/);
  assert.match(source, /management-mobile-nav/);
  assert.match(source, /management-role-switcher/);
  assert.match(source, /aria-label="返回网站首页"/);
  assert.match(source, /onClick=\{\(\) => router\.push\("\/"\)\}/);
  assert.match(source, /UserSwitchOutlined/);
  assert.match(source, /const roleSwitcherLabel/);
  assert.match(source, /<span>\{roleSwitcherLabel\}<\/span>/);
  assert.match(source, /<UserSwitchOutlined \/>/);
  assert.doesNotMatch(source, /management-role-switcher[\s\S]*<SwapOutlined \/>[\s\S]*<\/button>/);
  assert.doesNotMatch(source, /<span>角色切换<\/span>/);
  assert.match(source, /return "搜索客户 \/ 车牌 \/ VIN \/ 订单号"/);
  assert.doesNotMatch(source, /return "搜索订单、客户、物料\.\.\."/);
  assert.doesNotMatch(source, /placeholder="全局搜索档案、订单或规格\.\.\."/);
  assert.match(source, /roleMenuItems/);
  assert.match(source, /mobileMenuItems/);
  assert.match(source, /pathname === "\/"/);
  assert.match(source, /"\/auth"/);
  assert.match(source, /"\/stores\/"/);
  assert.doesNotMatch(mobilePrefixesSource, /"\/construction\/tasks"/);
  assert.match(source, /pathname\.startsWith\("\/construction\/tasks"\)/);
  assert.doesNotMatch(mobilePrefixesSource, /"\/construction\/schedules"/);
  assert.doesNotMatch(mobilePrefixesSource, /"\/construction\/camera"/);
  assert.match(source, /pathname\.startsWith\("\/construction\/camera"\)/);
  assert.match(source, /"\/construction\/materials"/);
  assert.doesNotMatch(mobilePrefixesSource, /"\/construction\/leaves"/);
  assert.match(source, /"\/construction\/offline"/);
  assert.match(source, /"\/construction\/profile"/);
  assert.ok(mobilePrefixesStart > -1, "mobile prefixes should be declared");
  assert.doesNotMatch(mobilePrefixesSource, /"\/construction\/leave-approvals"/);
  assert.doesNotMatch(mobilePrefixesSource, /"\/after-sales\/tasks"/);
  assert.match(source, /pathname\.startsWith\("\/after-sales"\)/);
  assert.match(source, /"\/orders"/);
  assert.match(source, /"\/members"/);
  assert.match(source, /"\/settings"/);
  assert.match(source, /"\/inventory"/);
  assert.match(source, /"\/purchases"/);
  assert.match(source, /hasAnySettingsReadPermission\(runtimePermissions\)/);
  assert.match(source, /const canAccessAdmin = Boolean\(runtimePermissions\?\.some/);
  assert.doesNotMatch(source, /canAccessSystemSettings/);
  assert.doesNotMatch(source, /aria-label="系统设置"/);
  assert.ok(roleMenuStart > -1, "role menu should be declared");
  assert.ok(accountMenuStart > roleMenuStart, "account menu should be declared after role menu");
  assert.doesNotMatch(roleMenuSource, /key: "settings"/);
  assert.doesNotMatch(roleMenuSource, /key: "profile"/);
  assert.match(source, /accountMenuItems/);
  assert.match(accountMenuSource, /key: "home"[\s\S]*label: "网站首页"[\s\S]*router\.push\("\/"\)/);
  assert.match(accountMenuSource, /key: "profile", icon: <UserOutlined \/>[\s\S]*label: "个人中心"[\s\S]*router\.push\("\/profile"\)/);
  assert.doesNotMatch(source, /\{ key: "profile", label: "我的", href: "\/profile"/);
});

test("management shell uses route-aware global search placeholders", () => {
  const source = readFileSync("src/features/workbench/management-shell.tsx", "utf8");

  assert.match(source, /getManagementSearchPlaceholder/);
  assert.match(source, /pathname\.startsWith\("\/reports"\)/);
  assert.match(source, /搜索报表、数据或人员\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/members"\)/);
  assert.match(source, /搜索员工、手机号\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/finance"\)/);
  assert.match(source, /搜索单号、客户或账户\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/finance\/payment-records"\)/);
  assert.match(source, /搜索单据、备注或经手人\.\.\./);
  assert.ok(
    source.indexOf('pathname.startsWith("/finance/payment-records")') < source.indexOf('pathname.startsWith("/finance")'),
    "finance payment-record detail placeholder must be checked before the generic finance route"
  );
  assert.match(source, /pathname\.startsWith\("\/invoices"\)/);
  assert.match(source, /搜索订单、发票或客户\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/rebates"\)/);
  assert.match(source, /搜索单号\/客户\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/commissions\/settlements"\)/);
  assert.match(source, /搜索订单或员工\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/commissions"\)/);
  assert.match(source, /搜索规则或人员\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/settings"\)/);
  assert.match(source, /搜索设置项\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/admin"\)/);
  assert.match(source, /搜索门店或经理\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/customers"\)/);
  assert.match(source, /搜索客户、手机号、车牌或 VIN\.\.\./);
  assert.doesNotMatch(source, /pathname\.startsWith\("\/customers"\) return "全局搜索\.\.\."/);
  assert.match(source, /pathname\.startsWith\("\/warranties"\)/);
  assert.match(source, /搜索质保单、车牌或车架号\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/after-sales"\)/);
  assert.match(source, /搜索订单或售后单\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/assignments"\)/);
  assert.match(source, /搜索订单号\/客户名\/车牌号\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/tasks"\)/);
  assert.match(source, /搜索我的任务、订单号或客户\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/camera"\)/);
  assert.match(source, /搜索照片、订单或阶段\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/leave-approvals"\)/);
  assert.match(source, /搜索师傅、请假日期或状态\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/leaves"\)/);
  assert.match(source, /搜索请假日期或原因\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/schedules"\)/);
  assert.match(source, /搜索排班日期或状态\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/capacities"\)/);
  assert.match(source, /搜索订单或日期\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/construction\/orders"\)/);
  assert.match(source, /搜索订单号或客户姓名\.\.\./);
  assert.doesNotMatch(source, /搜索订单 ID 或 客户姓名\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/orders\/create"\)/);
  assert.match(source, /搜索订单、客户\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/orders"\)/);
  assert.match(source, /搜索订单、客户、车牌\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/inventory\/purchase-orders\/"\)/);
  assert.match(source, /搜索采购单号\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/inventory\/purchase-orders"\)/);
  assert.match(source, /搜索采购需求或供应商\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/inventory\/suppliers"\)/);
  assert.match(source, /搜索供应商、联系人或分类\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/inventory\/movements"\)/);
  assert.match(source, /搜索入库单、批次号\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/inventory"\)/);
  assert.match(source, /搜索功能、物料、单据\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/purchases"\)/);
  assert.match(source, /搜索采购需求、采购单或供应商\.\.\./);
  assert.match(source, /pathname\.startsWith\("\/products"\)/);
  assert.match(source, /全局搜索档案、订单或规格\.\.\./);
  assert.match(source, /placeholder=\{getManagementSearchPlaceholder\(pathname\)\}/);
  assert.doesNotMatch(source, /placeholder="搜索订单、客户、物料\.\.\."/);
});

test("management shell has a compact mobile navigation layout", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /\.management-mobile-nav/);
  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /\.management-sidebar\s*\{\s*display: none;/);
  assert.match(source, /\.management-main\s*\{\s*padding-left: 0;/);
  assert.match(source, /\.management-mobile-nav\s*\{\s*display: grid;/);
  assert.match(source, /\.management-content\s*\{[^}]*padding-bottom: 92px;/s);
});

test("management shell switches to compact navigation on tablet widths", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /@media \(max-width: 900px\)/);
  assert.match(source, /@media \(max-width: 900px\)[\s\S]*\.management-sidebar\s*\{\s*display: none;/);
  assert.match(source, /@media \(max-width: 900px\)[\s\S]*\.management-main\s*\{\s*padding-left: 0;/);
  assert.match(source, /@media \(max-width: 900px\)[\s\S]*\.management-mobile-nav\s*\{\s*display: grid;/);
});

test("store page header hides default workbench back inside management shell", () => {
  const source = readFileSync("src/features/workbench/store-page-header.tsx", "utf8");

  assert.match(source, /showWorkbenchBack = !shouldUseManagementShell\(pathname\)/);
  assert.match(source, /\{showWorkbenchBack \? \(/);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pagePath = "app/members/page.tsx";

test("members management page exists as a dedicated prototype workspace", () => {
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /StorePageHeader/);
  assert.match(source, /人员管理/);
  assert.match(source, /members-workspace/);
  assert.match(source, /management-kpi-grid/);
  assert.match(source, /management-filter-card/);
  assert.match(source, /members-filter-result/);
  assert.match(source, /Table/);
  assert.match(source, /storeApi\.myStore/);
  assert.match(source, /memberApi\.searchInvitable/);
  assert.match(source, /memberApi\.invite/);
  assert.match(source, /memberApi\.remove/);
});

test("members management page keeps member operations out of the workbench-only layout", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.doesNotMatch(source, /router\.push\("\/workbench/);
  assert.doesNotMatch(source, /返回工作台/);
});

test("members management module tabs are internal member views", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /members-module-tabs/);
  assert.match(source, /MEMBER_VIEW_TABS/);
  assert.match(source, /全部成员/);
  assert.match(source, /师傅档案/);
  assert.match(source, /销售客服/);
  assert.match(source, /后勤岗位/);
  assert.match(source, /权限视图/);
  assert.match(source, /aria-label="人员视图切换"/);
  assert.doesNotMatch(source, /href="\/construction\/schedules"/);
  assert.doesNotMatch(source, /href="\/construction\/capacities"/);
  assert.doesNotMatch(source, /href="\/construction\/assignments"/);
  assert.match(cssSource, /\.members-module-tabs/);
  assert.match(cssSource, /\.members-module-tab\.is-active/);
});

test("members management maps legacy construction position query to craftsman view", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /useSearchParams/);
  assert.match(source, /positionParam === "CONSTRUCTION"/);
  assert.match(source, /activeMemberView/);
  assert.match(source, /craftsman/);
  assert.match(source, /router\.replace/);
});

test("members management exposes construction workspaces as related links", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /MEMBER_RELATED_WORKSPACES/);
  assert.match(source, /相关工作区/);
  assert.match(source, /施工派单/);
  assert.match(source, /施工容量/);
  assert.match(source, /请假审批/);
  assert.match(source, /href: "\/construction\/assignments"/);
  assert.match(source, /href: "\/construction\/capacities"/);
  assert.match(source, /href: "\/construction\/leave-approvals"/);
  assert.doesNotMatch(source, /href: "\/construction\/schedules"/);
  assert.match(cssSource, /\.members-related-workspaces/);
  assert.match(cssSource, /\.members-related-workspace/);
});

test("members management filter uses a horizontal prototype toolbar", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /\.members-layout\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(cssSource, /\.members-filter-grid\s*\{[^}]*grid-template-columns: minmax\(260px, 1fr\) minmax\(180px, 240px\) minmax\(120px, 160px\)/s);
  assert.match(cssSource, /\.members-filter-result/);
  assert.doesNotMatch(cssSource, /\.members-filter-panel\.ant-card\s*\{[^}]*position: sticky/s);
});

test("members management page labels the staff list panel like the prototype", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /title="人员列表"/);
  assert.match(source, /className="members-table-card"/);
});

test("members invitation uses a prototype right-side drawer", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /\bDrawer\b/);
  assert.match(source, /rootClassName="members-invite-drawer"/);
  assert.match(source, /className="members-invite-panel"/);
  assert.match(source, /footer=\{/);
  assert.match(cssSource, /\.members-invite-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(480px,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(source, /<Modal\s/);
  assert.doesNotMatch(source, /width=\{480\}/);
});

test("members invitation guards member selection with business-safe copy", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /请先选择邀请成员/);
  assert.doesNotMatch(source, /memberApi\.invite\(storeId!, inviteUser!\.id/);
});

test("members removal uses inline confirmation instead of global modal", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /\bPopconfirm\b/);
  assert.match(source, /title="确认移除成员"/);
  assert.match(source, /okText="移除"/);
  assert.match(source, /cancelText="取消"/);
  assert.doesNotMatch(source, /\bModal\b/);
  assert.doesNotMatch(source, /Modal\.confirm/);
});

test("members removal guards missing store with business-safe copy", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /if \(!storeId\) throw new Error\("当前账号未加入门店"\);/);
  assert.doesNotMatch(source, /memberApi\.remove\(storeId!, userId\)/);
});

test("members management page uses mobile cards for member rows", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const baseHiddenIndex = cssSource.indexOf(".members-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".members-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".members-mobile-cards", desktopTableIndex);

  assert.match(source, /members-mobile-cards/);
  assert.match(source, /members-mobile-card/);
  assert.match(source, /members-desktop-table/);
  assert.match(cssSource, /\.members-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\n\s{2}\.members-desktop-table \{\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.members-mobile-cards \{\n\s{4}display: grid;/);
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});

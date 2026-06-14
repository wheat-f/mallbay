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

test("members management filter uses a horizontal prototype toolbar", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /\.members-layout\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(cssSource, /\.members-filter-grid\s*\{[^}]*grid-template-columns: minmax\(260px, 1fr\) minmax\(180px, 240px\) minmax\(120px, 160px\)/s);
  assert.match(cssSource, /\.members-filter-result/);
  assert.doesNotMatch(cssSource, /\.members-filter-panel\.ant-card\s*\{[^}]*position: sticky/s);
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

test("members removal uses inline confirmation instead of global modal", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /\bPopconfirm\b/);
  assert.match(source, /title="确认移除成员"/);
  assert.match(source, /okText="移除"/);
  assert.match(source, /cancelText="取消"/);
  assert.doesNotMatch(source, /\bModal\b/);
  assert.doesNotMatch(source, /Modal\.confirm/);
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
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.members-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.members-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});

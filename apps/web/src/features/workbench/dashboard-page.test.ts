import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dashboardSource = readFileSync("app/dashboard/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

test("dashboard user search uses MallBay tokenized result styling", () => {
  assert.match(dashboardSource, /dashboard-user-search-results/);
  assert.match(dashboardSource, /dashboard-user-search-row/);
  assert.doesNotMatch(dashboardSource, /border-slate|bg-slate|text-slate/);
  assert.match(cssSource, /\.dashboard-user-search-results/);
  assert.match(cssSource, /\.dashboard-user-search-row/);
});

test("dashboard store creation uses a prototype right-side drawer", () => {
  assert.match(dashboardSource, /import \{[^}]*Drawer[^}]*\} from "antd"/s);
  assert.match(dashboardSource, /function CreateStoreDrawer/);
  assert.match(dashboardSource, /rootClassName="dashboard-create-store-drawer"/);
  assert.match(dashboardSource, /className="dashboard-create-store-drawer-footer"/);
  assert.doesNotMatch(dashboardSource, /function CreateStoreModal/);
  assert.doesNotMatch(dashboardSource, /<Modal\b/);
  assert.match(cssSource, /\.dashboard-create-store-drawer \.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.dashboard-create-store-drawer-footer/);
});

test("dashboard entry page follows the prototype account landing workspace", () => {
  assert.match(dashboardSource, /dashboard-entry-workspace/);
  assert.match(dashboardSource, /dashboard-entry-hero/);
  assert.match(dashboardSource, /dashboard-account-card/);
  assert.match(dashboardSource, /dashboard-entry-metrics/);
  assert.match(dashboardSource, /dashboard-entry-grid/);
  assert.match(dashboardSource, /dashboard-store-card/);
  assert.match(dashboardSource, /dashboard-auditor-panel/);
  assert.match(dashboardSource, /dashboard-quick-links/);
  assert.match(dashboardSource, /dashboard-action-card/);
  assert.match(dashboardSource, /账号入口/);
  assert.match(dashboardSource, /进入工作台/);
  assert.doesNotMatch(dashboardSource, /operation-action-grid/);
  assert.doesNotMatch(dashboardSource, /operation-panel/);

  assert.match(cssSource, /\.dashboard-entry-workspace/);
  assert.match(cssSource, /\.dashboard-entry-hero/);
  assert.match(cssSource, /\.dashboard-account-card/);
  assert.match(cssSource, /\.dashboard-entry-metrics/);
  assert.match(cssSource, /\.dashboard-entry-grid/);
  assert.match(cssSource, /\.dashboard-action-card/);
});

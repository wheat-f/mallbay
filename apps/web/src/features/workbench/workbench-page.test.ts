import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("workbench page falls back to the current session store instead of rendering an empty shell", () => {
  const pageSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");

  assert.match(pageSource, /useAuthStore/);
  assert.match(pageSource, /fallbackStore/);
  assert.match(pageSource, /user\?\.storeMember\?\.store\.id === storeId/);
  assert.match(pageSource, /getWorkbenchSections\(store\.currentMember\.position/);
  assert.match(pageSource, /workbench-data-alert/);
});

test("workbench and admin store detail pages expose prototype styled error states", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");
  const adminStoreSource = readFileSync("app/admin/stores/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(workbenchSource, /无法加载门店工作台/);
  assert.match(workbenchSource, /当前账号可能不属于该门店，或门店资料暂时无法读取。/);
  assert.doesNotMatch(workbenchSource, /门店资料接口暂时不可用/);
  assert.match(adminStoreSource, /无法加载门店详情/);
  assert.match(cssSource, /\.workbench-data-alert\.ant-alert/);
  assert.match(workbenchSource, /workbench-empty-panel/);
  assert.match(cssSource, /\.workbench-empty-panel/);
  assert.match(cssSource, /\.workbench-empty-state/);
  assert.doesNotMatch(workbenchSource, /section-card workbench-empty-state/);
});

test("user search dropdowns reuse the tokenized management result styling", () => {
  const dashboardSource = readFileSync("app/dashboard/page.tsx", "utf8");
  const adminSource = readFileSync("app/admin/page.tsx", "utf8");
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");
  const adminStoreSource = readFileSync("app/admin/stores/[id]/page.tsx", "utf8");

  for (const source of [dashboardSource, adminSource, workbenchSource, adminStoreSource]) {
    assert.match(source, /dashboard-user-search-results/);
    assert.match(source, /dashboard-user-search-row/);
    assert.doesNotMatch(source, /rounded border border-\[var\(--mb-border\)\] bg-white shadow-sm/);
  }
});

test("workbench photo hover actions use tokenized overlay controls", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(workbenchSource, /workbench-photo-action-button/);
  assert.match(cssSource, /\.workbench-photo-action-button/);
  assert.doesNotMatch(workbenchSource, /bg-white\/90/);
  assert.doesNotMatch(workbenchSource, /#666|#ff4d4f/);
});

test("workbench manager forms use prototype right-side drawers", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(workbenchSource, /\bDrawer\b/);
  assert.match(workbenchSource, /function InviteDrawer/);
  assert.match(workbenchSource, /function SubmitDrawer/);
  assert.match(workbenchSource, /rootClassName="workbench-invite-drawer"/);
  assert.match(workbenchSource, /rootClassName="workbench-submit-drawer"/);
  assert.match(workbenchSource, /workbench-drawer-footer/);
  assert.match(cssSource, /\.workbench-invite-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.workbench-submit-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(480px,\s*calc\(100vw - 24px\)\)/);
  assert.match(cssSource, /width:\s*min\(640px,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(workbenchSource, /function InviteModal/);
  assert.doesNotMatch(workbenchSource, /function SubmitModal/);
  assert.doesNotMatch(workbenchSource, /<Modal open=\{open\}/);
  assert.doesNotMatch(workbenchSource, /width=\{560\}/);
});

test("workbench invite drawer guards member selection with business-safe copy", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");

  assert.match(workbenchSource, /请先选择邀请成员/);
  assert.doesNotMatch(workbenchSource, /memberApi\.invite\(storeId, selected!\.id/);
});

test("workbench member removal uses inline confirmation instead of global modal", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");

  assert.match(workbenchSource, /\bPopconfirm\b/);
  assert.match(workbenchSource, /title="确认移除"/);
  assert.match(workbenchSource, /okText="移除"/);
  assert.match(workbenchSource, /cancelText="取消"/);
  assert.doesNotMatch(workbenchSource, /\bModal\b/);
  assert.doesNotMatch(workbenchSource, /Modal\.confirm/);
});

test("workbench page follows the prototype operations dashboard layout", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(workbenchSource, /workbench-operations-dashboard/);
  assert.match(workbenchSource, /workbench-kpi-grid/);
  assert.match(workbenchSource, /workbench-kpi-card/);
  assert.match(workbenchSource, /workbench-main-grid/);
  assert.match(workbenchSource, /workbench-schedule-card/);
  assert.match(workbenchSource, /workbench-exception-panel/);
  assert.match(workbenchSource, /workbench-task-board/);
  assert.match(workbenchSource, /workbench-trend-card/);
  assert.match(workbenchSource, /订单总数/);
  assert.match(workbenchSource, /今日施工容量/);
  assert.match(workbenchSource, /异常提醒/);
  assert.match(workbenchSource, /待处理任务/);
  assert.doesNotMatch(workbenchSource, /<section className="section-card mb-5">/);
  assert.doesNotMatch(workbenchSource, /section-card mb-5/);

  assert.match(cssSource, /\.workbench-operations-dashboard/);
  assert.match(cssSource, /\.workbench-kpi-grid/);
  assert.match(cssSource, /\.workbench-schedule-card/);
  assert.match(cssSource, /\.workbench-task-board/);
  assert.match(cssSource, /\.workbench-trend-card/);
});

test("workbench dashboard data is derived from business APIs instead of hardcoded demo numbers", () => {
  const workbenchSource = readFileSync("app/workbench/[storeId]/page.tsx", "utf8");

  assert.match(workbenchSource, /reportsApi\.summary\(storeId\)/);
  assert.match(workbenchSource, /orderApi\.list\(\{ storeId, status: "PENDING_DISPATCH"/);
  assert.match(workbenchSource, /constructionApi\.capacities\(\{ storeId, from: todayDate, to: todayDate \}\)/);
  assert.match(workbenchSource, /inventoryApi\.batches\(\{ storeId \}\)/);
  assert.match(workbenchSource, /warrantiesApi\.list\(storeId\)/);
  assert.match(workbenchSource, /buildWorkbenchKpis/);
  assert.match(workbenchSource, /buildCapacityItems/);
  assert.match(workbenchSource, /buildExceptionItems/);
  assert.match(workbenchSource, /buildTaskRows/);
  assert.match(workbenchSource, /buildWorkbenchTrendBars/);
  assert.doesNotMatch(workbenchSource, /Math\.max\(3, workbenchSections/);
  assert.doesNotMatch(workbenchSource, /value: isManager \? "4" : "2"/);
  assert.doesNotMatch(workbenchSource, /value: "8\/12"/);
  assert.doesNotMatch(workbenchSource, /value: "82%"/);
  assert.doesNotMatch(workbenchSource, /\["05\.01", 64\]/);
});

test("admin store review forms use prototype right-side drawers", () => {
  const adminStoreSource = readFileSync("app/admin/stores/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(adminStoreSource, /\bDrawer\b/);
  assert.match(adminStoreSource, /function RejectDrawer/);
  assert.match(adminStoreSource, /function ChangeManagerDrawer/);
  assert.match(adminStoreSource, /rootClassName="admin-store-reject-drawer"/);
  assert.match(adminStoreSource, /rootClassName="admin-store-manager-drawer"/);
  assert.match(adminStoreSource, /admin-store-drawer-footer/);
  assert.match(cssSource, /\.admin-store-reject-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.admin-store-manager-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(520px,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(adminStoreSource, /function RejectModal/);
  assert.doesNotMatch(adminStoreSource, /function ChangeManagerModal/);
  assert.doesNotMatch(adminStoreSource, /<Modal\b/);
});

test("admin store creation uses a prototype right-side drawer", () => {
  const adminSource = readFileSync("app/admin/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(adminSource, /\bDrawer\b/);
  assert.match(adminSource, /function CreateStoreDrawer/);
  assert.match(adminSource, /rootClassName="admin-store-create-drawer"/);
  assert.match(adminSource, /admin-store-drawer-footer/);
  assert.match(cssSource, /\.admin-store-create-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(520px,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(adminSource, /function CreateStoreModal/);
  assert.doesNotMatch(adminSource, /<Modal\b/);
});

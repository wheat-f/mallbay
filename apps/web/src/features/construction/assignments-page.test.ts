import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("construction assignments page uses worker business labels", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const workerMap =/);
  assert.match(pageSource, /options=\{filteredWorkers\.map/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /workerUserId\)\.join\("、"\)/);
});

test("construction assignments page does not fall back to technical order ids", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /订单信息待确认/);
  assert.doesNotMatch(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /row\.order\?\.orderNo \?\? row\.orderId/);
});

test("construction assignments page keeps missing vehicle labels readable", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /const vehicleLabel = \[order\.vehicle\.plateNo/);
  assert.match(pageSource, /return vehicleLabel \|\| "车辆未登记"/);
});

test("construction assignments page formats appointment dates with business-safe fallback", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /formatDispatchAppointmentDate/);
  assert.match(pageSource, /预约日期待确认/);
  assert.doesNotMatch(pageSource, /appointmentDate\?\.slice\(0, 10\)/);
});

test("construction assignments page uses business copy for missing product details", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /待库房核对产品明细/);
  assert.match(pageSource, /待库房核对产品/);
  assert.doesNotMatch(pageSource, /产品明细未加载/);
  assert.doesNotMatch(pageSource, /产品未加载/);
});

test("construction assignments page follows the prototype dispatch canvas layout", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /dispatch-canvas/);
  assert.match(pageSource, /dispatch-order-list/);
  assert.match(pageSource, /dispatch-order-detail/);
  assert.match(pageSource, /dispatch-worker-panel/);
  assert.match(pageSource, /dispatch-action-bar/);
  assert.match(pageSource, /待派单队列/);
  assert.match(pageSource, /订单施工信息/);
  assert.match(pageSource, /推荐施工组合/);
  assert.match(pageSource, /确认派单/);
});

test("construction assignments page replaces KPI and progress table with the prototype three-column board", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /dispatch-board-shell/);
  assert.match(pageSource, /dispatch-board-rail/);
  assert.match(pageSource, /dispatch-board-center/);
  assert.match(pageSource, /dispatch-board-aside/);
  assert.match(pageSource, /dispatch-cost-card/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /management-table-card/);
  assert.doesNotMatch(pageSource, /<Table/);
});

test("construction assignments page exposes prototype worker filters and inline assignment", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /技能筛选/);
  assert.match(pageSource, /可外出/);
  assert.match(pageSource, /擅长漆面保护膜/);
  assert.match(pageSource, /最多选择 3 位施工人员/);
  assert.match(pageSource, /selectedWorkerUserIds/);
  assert.match(pageSource, /workerSearchKeyword/);
  assert.match(pageSource, /setWorkerSearchKeyword/);
  assert.match(pageSource, /const filteredWorkers =/);
  assert.match(pageSource, /placeholder="搜索施工人员姓名、账号或技能"/);
  assert.match(pageSource, /showSearch/);
  assert.match(pageSource, /filterOption=\{filterWorkerOption\}/);
  assert.match(pageSource, /options=\{filteredWorkers\.map/);
  assert.match(pageSource, /filteredWorkers\.length/);
  assert.match(cssSource, /\.dispatch-worker-search/);
  assert.doesNotMatch(pageSource, /<Modal/);
});

test("construction assignments dispatch controls stay inside the action bar", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /\.dispatch-action-controls\s*\{[^}]*min-width: 0;/s);
  assert.match(cssSource, /\.dispatch-action-controls\s*\{[^}]*max-width: 100%;/s);
  assert.match(cssSource, /\.dispatch-action-controls \.ant-btn\s*\{[^}]*white-space: normal;/s);
  assert.match(cssSource, /@media \(min-width: 1180px\)[\s\S]*\.dispatch-action-controls\s*\{[^}]*width: min\(520px, 100%\);/);
  assert.doesNotMatch(cssSource, /\.dispatch-action-controls\s*\{[^}]*width: min\(520px, 48%\);/s);
});

test("construction assignments page confirms dispatch and warehouse matching in a right drawer", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /<Drawer/);
  assert.match(pageSource, /确认提交派工与库房匹配/);
  assert.match(pageSource, /订单概览/);
  assert.match(pageSource, /货品匹配预检/);
  assert.match(pageSource, /给库房\/施工主管的补充建议/);
  assert.match(pageSource, /确认提交，进入派工流转/);
  assert.match(pageSource, /库房备货/);
  assert.match(pageSource, /派工排期/);
  assert.match(pageSource, /暂存草稿/);
});

test("construction assignments page uses a business-safe dispatch guard", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /请先选择待派单订单/);
  assert.doesNotMatch(pageSource, /constructionApi\.assignOrder\(selectedOrder!\.id/);
});

test("construction assignments page memoizes pending order rows before selecting the active order", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /const pendingRows = useMemo\(\(\) => \(\(pendingOrdersQuery\.data\?\.items \?\? \[\]\) as OrderRow\[\]\),/);
  assert.match(pageSource, /\[pendingOrdersQuery\.data\?\.items\]/);
  assert.doesNotMatch(pageSource, /const selectedOrder = useMemo/);
});

test("construction assignments page combines pending orders and assigned construction records", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /buildConstructionWorkItems/);
  assert.match(pageSource, /getVisibleConstructionWorkItems/);
  assert.match(pageSource, /activeWorkOrderTab/);
  assert.match(pageSource, /施工工单/);
  assert.match(pageSource, /待派单/);
  assert.match(pageSource, /已派工/);
  assert.match(pageSource, /施工中/);
  assert.match(pageSource, /已完工/);
});

test("construction assignments page keeps dispatch controls scoped to pending orders", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /selectedWorkItem\?\.kind === "pending"/);
  assert.match(pageSource, /selectedPendingOrder/);
  assert.match(pageSource, /selectedConstructionRecord/);
  assert.match(pageSource, /查看施工工单/);
});

test("construction assignments page does not show work order actions in the empty state", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /\) : selectedConstructionRecord \? \(/);
  assert.match(pageSource, /\) : null\}/);
});

test("construction assignments page exposes assigned work order detail entry", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /selectedConstructionRecord/);
  assert.match(pageSource, /router\.push\(`\/construction\/orders\/\$\{selectedConstructionRecord\.orderId\}`\)/);
  assert.match(pageSource, /施工团队/);
  assert.match(pageSource, /施工照片/);
  assert.match(pageSource, /质检状态/);
});

test("construction assignments page treats construction progress as navigable work orders", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /施工履约进度/);
  assert.match(pageSource, /查看全部工单/);
  assert.match(pageSource, /setActiveWorkOrderTab\("all"\)/);
  assert.match(pageSource, /router\.push\(`\/construction\/orders\/\$\{record\.orderId\}`\)/);
});

test("construction assignments page has lifecycle tab and readonly action styles", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /\.dispatch-work-order-tabs/);
  assert.match(cssSource, /\.dispatch-work-order-tabs button\.is-active/);
  assert.match(cssSource, /\.dispatch-action-bar-readonly/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("construction assignments page uses worker business labels", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const workerMap =/);
  assert.match(pageSource, /options=\{workers\.map/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /workerUserId\)\.join\("、"\)/);
});

test("construction assignments page does not fall back to technical order ids", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /row\.order\?\.orderNo \?\? row\.orderId/);
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

  assert.match(pageSource, /技能筛选/);
  assert.match(pageSource, /可外出/);
  assert.match(pageSource, /擅长漆面保护膜/);
  assert.match(pageSource, /最多选择 3 位施工人员/);
  assert.match(pageSource, /selectedWorkerUserIds/);
  assert.doesNotMatch(pageSource, /<Modal/);
});

test("construction assignments page memoizes pending order rows before selecting the active order", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /const pendingRows = useMemo\(\(\) => \(\(pendingOrdersQuery\.data\?\.items \?\? \[\]\) as OrderRow\[\]\),/);
  assert.match(pageSource, /\[pendingOrdersQuery\.data\?\.items\]/);
  assert.doesNotMatch(pageSource, /const selectedOrder = useMemo/);
});

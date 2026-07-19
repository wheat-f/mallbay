import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/reports/page.tsx", "utf8");

test("reports page presents six non-duplicated operational views", () => {
  for (const label of ["销售业绩", "施工绩效", "财务订单利润", "项目经营分析", "售后人员分析", "售后结构分析"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(source, /施工人员提成/);
  assert.doesNotMatch(source, /销售人员提成统计/);
});

test("reports page loads the dedicated operational data and real filter options", () => {
  assert.match(source, /reportsApi\.operational\(query\)/);
  assert.match(source, /reportsApi\.filterOptions\(storeId\)/);
  assert.doesNotMatch(source, /reportsApi\.summary\(storeId\)/);
  assert.match(source, /options\?\.salesPeople/);
  assert.match(source, /options\?\.constructionPeople/);
});

test("reports page filters by business dates and actual dimensions", () => {
  assert.match(source, /DatePicker\.RangePicker/);
  for (const label of ["日期口径", "销售人员", "施工人员", "施工类型", "产品分类", "订单状态"]) {
    assert.match(source, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(source, /当前登录用户/);
  assert.doesNotMatch(source, /全部技师/);
});

test("sales users are restricted to their own performance view", () => {
  assert.match(source, /const isSales = user\?\.storeMember\?\.position === "SALES"/);
  assert.match(source, /reportViews\.filter\(\(item\) => item\.key === "sales"\)/);
  assert.match(source, /isSales \? "我的销售业绩" : "分析报表中心"/);
});

test("reports explain cost source, commission states and no-invented construction allocation", () => {
  assert.match(source, /成本来源/);
  assert.match(source, /未确认时只展示实际提成/);
  assert.match(source, /应计\/已确认\/已结算提成/);
  assert.match(source, /afterSaleRateBps/);
  assert.match(source, /店长手工分摊/);
});

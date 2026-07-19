import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("施工成本工作台分别提供店长确认与财务审批结算操作", () => {
  const page = readFileSync("app/construction/cost-settlements/page.tsx", "utf8");
  const api = readFileSync("src/features/construction/api.ts", "utf8");

  assert.match(page, /const canConfirm/);
  assert.match(page, /const canSettle/);
  assert.match(page, /施工成本确认/);
  assert.match(page, /施工成本结算/);
  assert.match(page, /确认结算并永久冻结/);
  assert.match(page, /CONSTRUCTION_COST_ADJUSTMENT_REASON/);
  assert.match(page, /CONSTRUCTION_TIME_VARIANCE_REASON/);
  assert.match(page, /确认工时偏差原因（必选，来自系统字典）/);
  assert.match(page, /hasUnexplainedVariance/);
  assert.match(page, /选择调整原因（来自系统字典）/);
  assert.match(page, /CostAdjustmentPanel/);
  assert.match(api, /createCostAdjustment/);
  assert.match(api, /approveCostAdjustment/);
  assert.match(api, /settleCostSettlement/);
});

test("店长可在确认成本时按人员手工分配施工收费，并保留按确认工时的默认规则", () => {
  const page = readFileSync("app/construction/cost-settlements/page.tsx", "utf8");
  assert.match(page, /店长手工分配施工金额/);
  assert.match(page, /manualConstructionChargeCents/);
  assert.match(page, /默认按确认工时比例分摊/);
  assert.match(page, /合计必须等于本单施工收费/);
});

test("店长导出施工成本时不展示个人薪酬明细", () => {
  const page = readFileSync("app/construction/cost-settlements/page.tsx", "utf8");
  assert.match(page, /const canViewDetailedLaborCosts = canSettle/);
  assert.match(page, /不含个人薪酬明细/);
  assert.match(page, /canViewDetailedLaborCosts \? \{ "岗位小时成本"/);
});

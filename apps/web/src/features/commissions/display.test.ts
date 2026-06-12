import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommissionRuleTypeLabel } from "./display";

test("getCommissionRuleTypeLabel formats commission rule types", () => {
  assert.equal(getCommissionRuleTypeLabel("FIXED_RATE"), "固定比例");
  assert.equal(getCommissionRuleTypeLabel("FIXED_AMOUNT"), "固定金额");
  assert.equal(getCommissionRuleTypeLabel("SALES_TIER"), "销售阶梯");
  assert.equal(getCommissionRuleTypeLabel("CONSTRUCTION_TYPE"), "施工类型");
  assert.equal(getCommissionRuleTypeLabel("UNKNOWN"), "UNKNOWN");
});

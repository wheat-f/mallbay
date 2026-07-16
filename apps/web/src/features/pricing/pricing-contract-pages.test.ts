import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("pricing API exposes rule detail update and vehicle maintenance contracts", () => {
  const api = readFileSync("src/features/pricing/api.ts", "utf8");
  assert.equal(api.includes("ruleSet: (id: string, storeId: string)"), true);
  assert.equal(api.includes("updateRuleSet: (id: string, payload: PricingRuleSetPayload)"), true);
  assert.match(api, /updateVehicleClass/);
  assert.match(api, /updateVehicleMapping/);
});

test("rule version detail keeps published versions read only and draft versions editable", () => {
  const page = readFileSync("app/orders/pricing/rule-sets/[id]/page.tsx", "utf8");
  assert.match(page, /规则版本详情/);
  assert.equal(page.includes('ruleSet.status !== "DRAFT"'), true);
  assert.equal(page.includes("pricingApi.updateRuleSet"), true);
});

test("quote detail exposes draft submission approval and conversion lifecycle", () => {
  const api = readFileSync("src/features/sales-quotes/api.ts", "utf8");
  const page = readFileSync("app/orders/quotes/[id]/page.tsx", "utf8");
  assert.equal(api.includes("/sales-quotes/${id}/submit"), true);
  assert.equal(api.includes("/sales-quotes/${id}?storeId"), true);
  assert.match(page, /提交审批/);
  assert.match(page, /批准/);
  assert.match(page, /转正式订单/);
  assert.match(page, /价格快照/);
});

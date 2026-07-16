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

test("rule version detail presents a frozen business-readable snapshot", () => {
  const page = readFileSync("app/orders/pricing/rule-sets/[id]/page.tsx", "utf8");
  assert.match(page, /建议价方案详情/);
  assert.match(page, /正式订单始终使用创建时冻结的建议价版本/);
  assert.equal(page.includes("pricingApi.updateRuleSet"), false);
  assert.equal(page.includes("JSON.stringify"), false);
  assert.equal(page.includes("草稿 JSON 编辑器"), false);
});

test("pricing workspace uses system dictionaries and autosaves structured business rules", () => {
  const page = readFileSync("app/orders/pricing/page.tsx", "utf8");
  const workspace = readFileSync("src/features/pricing/pricing-workspace.tsx", "utf8");
  assert.match(page, /dictionaryApi\.list/);
  assert.match(page, /PRODUCT_CATEGORY/);
  assert.match(page, /CONSTRUCTION_TYPE/);
  assert.match(page, /CONSTRUCTION_LOCATION/);
  assert.match(page, /PRODUCT_UNIT/);
  assert.match(page, /pricingApi\.updateRuleSet/);
  assert.match(page, /window\.setTimeout\(\(\) => saveDraft\(false\), 1200\)/);
  assert.match(page, /findRuleConflictIndexes/);
  assert.match(page, /同一适用条件只能保留一条价格调整/);
  assert.match(workspace, /产品建议价/);
  assert.equal(page.includes("普通偏差 bps"), false);
  assert.equal(page.includes("人工分"), false);
});

test("vehicle pricing page prioritizes unmatched real vehicles and hides technical priority", () => {
  const page = readFileSync("app/orders/pricing/vehicles/page.tsx", "utf8");
  assert.match(page, /先处理尚未归类的车辆/);
  assert.match(page, /确认归类/);
  assert.match(page, /高级维护：车型级别与通用映射/);
  assert.equal(page.indexOf("待归类车辆") < page.indexOf("当前匹配规则"), true);
  assert.equal(page.includes('title: "优先级"'), false);
  assert.equal(page.includes('dataIndex: "customerId"'), false);
  assert.match(page, /pricingApi\.updateVehicleClass/);
  assert.match(page, /pricingApi\.updateVehicleMapping/);
  assert.match(page, /修改车型级别/);
  assert.match(page, /修改车型匹配规则/);
});

test("pricing simulator is a manager-friendly business form without JSON input", () => {
  const page = readFileSync("app/orders/pricing/simulator/page.tsx", "utf8");
  assert.match(page, /返回建议价设置/);
  assert.match(page, /选择订单条件/);
  assert.match(page, /添加试算产品/);
  assert.match(page, /逐产品建议价/);
  assert.equal(page.includes("JSON.parse"), false);
  assert.equal(page.includes("Input.TextArea"), false);
  assert.equal(page.includes("规则集 ID"), false);
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

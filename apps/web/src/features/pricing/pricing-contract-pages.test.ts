import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { conditionOperatorOptions } from "./pricing-workspace";

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
  assert.match(page, /施工成本已改为统一的标准成本口径/);
  assert.match(page, /constructionCostSource: "STRUCTURED_STANDARD"/);
  assert.match(page, /产品建议价规则/);
  assert.match(page, /施工收费不在本页维护/);
  assert.match(workspace, /title: "产品建议价规则"/);
  assert.match(workspace, /function conditionOperatorOptions/);
  assert.match(workspace, /NUMERIC_CONDITION_FIELDS/);
  assert.match(workspace, /conditionOperatorHelp/);
  assert.equal(workspace.includes('value: "LABOR", label: "施工人工费"'), false);
  assert.equal(page.includes("施工项目来自门店系统字典"), false);
  assert.match(workspace, /产品建议价/);
  assert.equal(page.includes("普通偏差 bps"), false);
  assert.equal(page.includes("人工分"), false);
});

test("pricing condition operators follow the selected field semantics", () => {
  assert.deepEqual(conditionOperatorOptions("vehicleClassCode").map((item) => item.value), ["EQ", "IN"]);
  assert.deepEqual(conditionOperatorOptions("productCategory").map((item) => item.value), ["EQ", "IN"]);
  assert.deepEqual(conditionOperatorOptions("quantity").map((item) => item.value), ["EQ", "BETWEEN", "GTE", "LTE"]);
});

test("construction cost setup page binds dictionary data, standards, and published role rates", () => {
  const page = readFileSync("app/orders/pricing/construction-costs/page.tsx", "utf8");
  const servicesPage = readFileSync("app/orders/pricing/construction-costs/services/page.tsx", "utf8");
  const ratesPage = readFileSync("app/orders/pricing/construction-costs/rates/page.tsx", "utf8");
  const standardsPage = readFileSync("app/orders/pricing/construction-costs/standards/page.tsx", "utf8");
  const api = readFileSync("src/features/pricing/api.ts", "utf8");
  assert.match(page, /施工收费与成本标准/);
  assert.match(page, /CONSTRUCTION_POSITION_TYPE/);
  assert.match(page, /pricingApi\.createConstructionServiceItem/);
  assert.match(page, /pricingApi\.createPositionCostRateVersion/);
  assert.match(page, /pricingApi\.publishPositionCostRateVersion/);
  assert.match(page, /pricingApi\.updateRuleSet/);
  assert.match(page, /function HelpLabel/);
  assert.match(page, /function SectionTitle/);
  assert.match(page, /positionLabel\(rate\.positionTypeCode\)/);
  assert.match(page, /locationLabel\(row\.constructionLocationCode\)/);
  assert.match(page, /同一施工组只保存一条主标准/);
  assert.match(page, /每个追加项目收费/);
  assert.match(page, /standardsOverlap/);
  assert.match(page, /ConstructionPageActions/);
  assert.match(page, /construction-page-actions/);
  assert.match(servicesPage, /section="services"/);
  assert.match(ratesPage, /section="rates"/);
  assert.match(standardsPage, /section="standards"/);
  assert.match(api, /constructionServiceItems:/);
  assert.match(api, /positionCostRateVersions:/);
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

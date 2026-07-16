import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePricing,
  evaluatePricingGuard,
  type PricingRule
} from "./pricing-engine";
import { aggregateMultiProductLabor } from "./multi-product-labor";

const baseInput = {
  ruleSetVersion: 3,
  vehicleClassCode: "SUV",
  constructionType: "PPF",
  constructionLocation: "OUTSIDE",
  baseLaborCostCents: 10000,
  lines: [
    {
      id: "line-1",
      productId: "product-1",
      category: "PPF",
      brand: "3M",
      model: "PLUS",
      salesUnit: "ROLL",
      quantity: 2,
      baseUnitPriceCents: 100000,
      minimumPriceCents: 95000
    }
  ]
} as const;

function rule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: "rule-1",
    group: "PRODUCT",
    target: "PRODUCT_LINE",
    name: "产品加价",
    conditions: [],
    actionType: "ADD_CENTS",
    actionValue: 1000,
    priority: 1,
    sortOrder: 1,
    enabled: true,
    ...overrides
  };
}

test("固定顺序下跨组叠加、同组只选择优先级最高规则", () => {
  const result = calculatePricing(baseInput, [
    rule({ id: "product-low", actionValue: 5000, priority: 1 }),
    rule({ id: "product-high", actionValue: 1000, priority: 2 }),
    rule({
      id: "vehicle-discount",
      group: "VEHICLE",
      actionType: "DISCOUNT_BPS",
      actionValue: 500
    }),
    rule({
      id: "construction-surcharge",
      group: "CONSTRUCTION",
      actionType: "ADD_CENTS",
      actionValue: 2000,
      conditions: [{ field: "constructionLocation", operator: "EQ", value: "OUTSIDE" }]
    })
  ]);

  assert.equal(result.lines[0].suggestedUnitPriceCents, 97950);
  assert.equal(result.lines[0].suggestedAmountCents, 195900);
  assert.equal(result.suggestedLaborCostCents, 10000);
  assert.deepEqual(result.appliedRules.map((item) => item.ruleId), [
    "product-high",
    "vehicle-discount",
    "construction-surcharge"
  ]);
  assert.deepEqual(result.calculationSteps.map((item) => item.stage), [
    "PRODUCT:PRODUCT_LINE",
    "VEHICLE:PRODUCT_LINE",
    "CONSTRUCTION:PRODUCT_LINE"
  ]);
});

test("fractional quantities round line and order money to integer cents", () => {
  const result = calculatePricing({
    ...baseInput,
    lines: [{ ...baseInput.lines[0], quantity: 1.333, baseUnitPriceCents: 10001 }]
  }, []);

  assert.equal(result.lines[0].suggestedAmountCents, 13331);
  assert.equal(result.suggestedTotalCents, 23331);
  assert.equal(Number.isInteger(result.suggestedTotalCents), true);
});

test("条件支持产品、单位、数量、车辆和多产品上下文", () => {
  const result = calculatePricing(
    {
      ...baseInput,
      lines: [
        baseInput.lines[0],
        {
          ...baseInput.lines[0],
          id: "line-2",
          productId: "product-2",
          quantity: 3,
          salesUnit: "METER"
        }
      ]
    },
    [
      rule({
        id: "meter-rule",
        conditions: [{ field: "salesUnit", operator: "EQ", value: "METER" }],
        actionValue: 2000
      }),
      rule({
        id: "quantity-rule",
        group: "SURCHARGE",
        conditions: [{ field: "quantity", operator: "GTE", value: 3 }],
        actionValue: 3000
      }),
      rule({
        id: "bundle-rule",
        group: "BUNDLE",
        conditions: [{ field: "lineCount", operator: "GTE", value: 2 }],
        actionType: "DISCOUNT_BPS",
        actionValue: 100,
        target: "ORDER"
      })
    ]
  );

  assert.equal(result.lines[0].suggestedUnitPriceCents, 100000);
  assert.equal(result.lines[1].suggestedUnitPriceCents, 105000);
  assert.equal(result.suggestedTotalCents, 519750);
});

test("同一版本同一输入产生稳定 hash 和结果", () => {
  const rules = [rule({ id: "stable", actionValue: 1234 })];
  const first = calculatePricing(baseInput, rules);
  const second = calculatePricing(baseInput, rules);
  assert.equal(first.inputHash, second.inputHash);
  assert.deepEqual(first, second);
});

test("产品行、人工费、总价和毛利取最严格判定", () => {
  const suggestion = calculatePricing(baseInput, []);
  const result = evaluatePricingGuard(
    suggestion,
    {
      lines: [{ id: "line-1", unitPriceCents: 96000 }],
      laborCostCents: 11000,
      estimatedCostCents: 190000
    },
    {
      normalDeviationBps: 500,
      approvalDeviationBps: 1500,
      minimumMarginBps: 1000,
      blockBelowMarginBps: 0
    }
  );
  assert.equal(result.decision, "APPROVAL_REQUIRED");
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks.find((check) => check.scope === "MARGIN")?.decision, "APPROVAL_REQUIRED");
});

test("低于最低保护价或毛利硬底线时阻断", () => {
  const suggestion = calculatePricing(baseInput, []);
  const result = evaluatePricingGuard(
    suggestion,
    {
      lines: [{ id: "line-1", unitPriceCents: 90000 }],
      laborCostCents: 0,
      estimatedCostCents: 250000
    },
    {
      normalDeviationBps: 500,
      approvalDeviationBps: 1500,
      minimumMarginBps: 1000,
      blockBelowMarginBps: 0
    }
  );
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.checks.find((check) => check.scope === "PRODUCT_LINE")?.decision, "BLOCKED");
  assert.equal(result.checks.find((check) => check.scope === "MARGIN")?.decision, "BLOCKED");
});

test("超过审批偏差上限时阻断", () => {
  const suggestion = calculatePricing(baseInput, []);
  const result = evaluatePricingGuard(
    suggestion,
    {
      lines: [{ id: "line-1", unitPriceCents: 70000 }],
      laborCostCents: 10000
    },
    { normalDeviationBps: 500, approvalDeviationBps: 1500, minimumMarginBps: 0 }
  );
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.checks.find((check) => check.scope === "PRODUCT_LINE")?.decision, "BLOCKED");
});

test("多产品人工费采用最高基础人工费并叠加其他项目追加人工费", () => {
  assert.deepEqual(
    aggregateMultiProductLabor([
      { id: "film", baseLaborCostCents: 180000, addonLaborCostCents: 20000 },
      { id: "heat", baseLaborCostCents: 80000, addonLaborCostCents: 30000 },
      { id: "inspection", baseLaborCostCents: 20000, addonLaborCostCents: 5000 }
    ]),
    {
      primaryLineId: "film",
      baseLaborCostCents: 180000,
      addonLaborCostCents: 35000,
      totalLaborCostCents: 215000
    }
  );
});


test("成交产品行缺失时取阻断结果", () => {
  const suggestion = calculatePricing(baseInput, []);
  const result = evaluatePricingGuard(suggestion, { lines: [], laborCostCents: 10000 }, { normalDeviationBps: 500, approvalDeviationBps: 1500, minimumMarginBps: 0 });
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.checks.some((check) => check.key === "line-count"), true);
});

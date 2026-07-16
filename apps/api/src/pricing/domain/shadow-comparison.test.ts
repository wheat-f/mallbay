import assert from "node:assert/strict";
import test from "node:test";
import { calculatePricing } from "./pricing-engine";
import { compareShadowPricing } from "./shadow-comparison";

test("shadow comparison records legacy and suggested totals without changing the legacy amount", () => {
  const input = {
    ruleSetVersion: 1,
    lines: [{ id: "l1", productId: "p1", category: "PPF", brand: "b", model: "m", salesUnit: "ROLL", quantity: 2, baseUnitPriceCents: 1000 }],
    constructionType: "PPF",
    constructionLocation: "IN_STORE",
    baseLaborCostCents: 500
  };
  const suggestion = calculatePricing(input, []);
  const comparison = compareShadowPricing(input, suggestion);
  assert.equal(comparison.legacyTotalCents, 2500);
  assert.equal(comparison.deltaTotalCents, 0);
  assert.equal(comparison.deltaBps, 0);
});

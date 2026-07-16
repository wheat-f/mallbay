import assert from "node:assert/strict";
import test from "node:test";
import { calculatePricing } from "./pricing-engine";

const legacyInput = {
  ruleSetVersion: 0,
  lines: [{
    id: "line-1",
    productId: "product-1",
    category: "PPF",
    brand: "品牌",
    model: "型号",
    salesUnit: "ROLL",
    quantity: 2,
    baseUnitPriceCents: 680_000
  }],
  constructionType: "PPF",
  constructionLocation: "IN_STORE",
  baseLaborCostCents: 180_000
};

test("legacy baseline keeps product base price, labor and total behavior", () => {
  const result = calculatePricing(legacyInput, []);
  assert.equal(result.lines[0]?.suggestedUnitPriceCents, 680_000);
  assert.equal(result.suggestedProductAmountCents, 1_360_000);
  assert.equal(result.suggestedLaborCostCents, 180_000);
  assert.equal(result.suggestedTotalCents, 1_540_000);
});

test("legacy order request shape remains explicit for migration", () => {
  assert.deepEqual(Object.keys(legacyInput).sort(), [
    "baseLaborCostCents",
    "constructionLocation",
    "constructionType",
    "lines",
    "ruleSetVersion"
  ]);
  assert.deepEqual(Object.keys(legacyInput.lines[0]).sort(), [
    "baseUnitPriceCents",
    "brand",
    "category",
    "id",
    "model",
    "productId",
    "quantity",
    "salesUnit"
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCosts } from "./cost-estimator";

test("成本估算按库存加权、最近入库、标准成本和缺失成本的顺序选择", () => {
  const result = estimateCosts({
    lines: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 3 }, { productId: "p3", quantity: 1 }, { productId: "p4", quantity: 1 }],
    costs: {
      p1: { weightedAverageCents: 110 },
      p2: { recentCents: 220 },
      p3: { standardCents: 330 },
      p4: {}
    }
  });
  assert.deepEqual(result.lines.map((line) => line.source), ["INVENTORY_WEIGHTED_AVERAGE", "RECENT_RECEIPT", "STANDARD_COST", "MISSING"]);
  assert.equal(result.materialCostCents, 110 * 2 + 220 * 3 + 330);
  assert.equal(result.estimatedMaterialCostCents, 110 * 2 + 220 * 3 + 330);
  assert.equal(result.estimatedCostCents, 110 * 2 + 220 * 3 + 330);
  assert.equal(result.hasMissingCost, true);
  assert.equal(result.costCompleteness, "MISSING");
});


test("cost estimator accepts fractional meter quantities", () => {
  const result = estimateCosts({
    lines: [{ productId: "p1", quantity: 12.5 }],
    costs: { p1: { standardCents: 100 } }
  });
  assert.equal(result.lines[0]?.estimatedCostCents, 1250);
});

test("成本估算不会把向客户收取的施工收费当作内部成本", () => {
  const result = estimateCosts({
    lines: [{ productId: "p1", quantity: 2 }],
    costs: { p1: { standardCents: 100 } },
    // Compatibility input from the former API contract. It must be ignored.
    laborCostCents: 180000
  });

  assert.equal(result.estimatedMaterialCostCents, 200);
  assert.equal(result.estimatedCostCents, 200);
});
